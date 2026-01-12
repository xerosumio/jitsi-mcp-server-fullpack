import { spawn, ChildProcess } from 'child_process';
import { createWriteStream, WriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { Page } from 'puppeteer';
import config from '../config.js';

export interface RecordingOptions {
  width?: number;
  height?: number;
  fps?: number;
  audioBitrate?: string;
  videoBitrate?: string;
}

export class MediaRecorder {
  private ffmpegProcess: ChildProcess | null = null;
  private isRecording = false;
  private outputPath: string | null = null;
  private frameStream: WriteStream | null = null;
  private cdpClient: any = null;

  constructor(private page: Page) {}

  async startRecording(outputPath: string, options: RecordingOptions = {}): Promise<string> {
    if (this.isRecording) {
      throw new Error('Already recording');
    }

    const {
      width = 1920,
      height = 1080,
      fps = 30,
      videoBitrate = '2500k',
    } = options;

    // Ensure output directory exists
    await mkdir(dirname(outputPath), { recursive: true });

    this.outputPath = outputPath;

    // Create CDP session for screen capture
    this.cdpClient = await this.page.createCDPSession();

    // Set viewport size
    await this.page.setViewport({ width, height });

    // Create a pipe for frame data
    const pipePath = join(dirname(outputPath), `.frames-${Date.now()}.pipe`);

    // Start FFmpeg process
    // Using image2pipe input for frames captured via CDP
    this.ffmpegProcess = spawn('ffmpeg', [
      '-y', // Overwrite output file
      '-f', 'image2pipe',
      '-framerate', fps.toString(),
      '-i', 'pipe:0', // Read from stdin
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-b:v', videoBitrate,
      outputPath,
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.ffmpegProcess.stderr?.on('data', (data) => {
      // FFmpeg logs to stderr
      const msg = data.toString();
      if (msg.includes('Error') || msg.includes('error')) {
        console.error('[FFmpeg]', msg);
      }
    });

    this.ffmpegProcess.on('close', (code) => {
      console.log(`[MediaRecorder] FFmpeg exited with code ${code}`);
      this.isRecording = false;
    });

    this.ffmpegProcess.on('error', (err) => {
      console.error('[MediaRecorder] FFmpeg error:', err);
      this.isRecording = false;
    });

    // Start capturing frames
    await this.startFrameCapture(fps);

    this.isRecording = true;
    console.log(`[MediaRecorder] Started recording to: ${outputPath}`);

    return outputPath;
  }

  private async startFrameCapture(fps: number): Promise<void> {
    if (!this.cdpClient || !this.ffmpegProcess?.stdin) return;

    const frameInterval = 1000 / fps;
    let lastFrameTime = 0;

    // Start screen capture
    await this.cdpClient.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 80,
      maxWidth: 1920,
      maxHeight: 1080,
      everyNthFrame: 1,
    });

    this.cdpClient.on('Page.screencastFrame', async (frame: any) => {
      if (!this.isRecording || !this.ffmpegProcess?.stdin) return;

      const now = Date.now();
      if (now - lastFrameTime < frameInterval * 0.8) {
        // Skip frame if too soon (rate limiting)
        await this.cdpClient.send('Page.screencastFrameAck', {
          sessionId: frame.sessionId,
        });
        return;
      }
      lastFrameTime = now;

      try {
        const frameBuffer = Buffer.from(frame.data, 'base64');

        // Write frame to FFmpeg stdin
        if (this.ffmpegProcess?.stdin?.writable) {
          this.ffmpegProcess.stdin.write(frameBuffer);
        }

        // Acknowledge frame
        await this.cdpClient.send('Page.screencastFrameAck', {
          sessionId: frame.sessionId,
        });
      } catch (error) {
        console.error('[MediaRecorder] Frame capture error:', error);
      }
    });
  }

  async stopRecording(): Promise<string | null> {
    if (!this.isRecording) {
      return null;
    }

    // Stop screen capture
    if (this.cdpClient) {
      try {
        await this.cdpClient.send('Page.stopScreencast');
      } catch (e) {
        // Ignore errors
      }
    }

    // Close FFmpeg stdin to signal end of input
    if (this.ffmpegProcess?.stdin) {
      this.ffmpegProcess.stdin.end();
    }

    // Wait for FFmpeg to finish
    await new Promise<void>((resolve) => {
      if (this.ffmpegProcess) {
        this.ffmpegProcess.on('close', () => resolve());
        // Give it a timeout
        setTimeout(() => {
          if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
            this.ffmpegProcess.kill('SIGTERM');
          }
          resolve();
        }, 10000);
      } else {
        resolve();
      }
    });

    const outputPath = this.outputPath;
    this.isRecording = false;
    this.outputPath = null;
    this.ffmpegProcess = null;
    this.cdpClient = null;

    console.log(`[MediaRecorder] Stopped recording. Saved to: ${outputPath}`);
    return outputPath;
  }

  getIsRecording(): boolean {
    return this.isRecording;
  }

  getOutputPath(): string | null {
    return this.outputPath;
  }
}

// Audio recorder using Web Audio API and chrome capture
export class AudioRecorder {
  private isRecording = false;
  private outputPath: string | null = null;
  private ffmpegProcess: ChildProcess | null = null;

  constructor(private page: Page) {}

  async startRecording(outputPath: string): Promise<string> {
    if (this.isRecording) {
      throw new Error('Already recording audio');
    }

    await mkdir(dirname(outputPath), { recursive: true });
    this.outputPath = outputPath;

    // Inject audio capture script into the page
    await this.page.evaluate(() => {
      // @ts-ignore
      window.__audioChunks = [];
      // @ts-ignore
      window.__audioRecorder = null;

      // Get audio context from Jitsi's audio elements
      const audioElements = document.querySelectorAll('audio');
      if (audioElements.length === 0) {
        console.warn('No audio elements found');
        return;
      }

      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();

      audioElements.forEach((audio) => {
        try {
          const source = audioContext.createMediaElementSource(audio);
          source.connect(destination);
          source.connect(audioContext.destination); // Keep playing
        } catch (e) {
          console.warn('Could not capture audio element:', e);
        }
      });

      // @ts-ignore - Browser MediaRecorder API
      const mediaRecorder = new MediaRecorder(destination.stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      // @ts-ignore - Browser MediaRecorder API
      mediaRecorder.ondataavailable = (event: any) => {
        if (event.data.size > 0) {
          // @ts-ignore
          window.__audioChunks.push(event.data);
        }
      };

      // @ts-ignore - Browser MediaRecorder API
      mediaRecorder.start(1000); // Capture in 1-second chunks
      // @ts-ignore
      window.__audioRecorder = mediaRecorder;
    });

    this.isRecording = true;
    console.log(`[AudioRecorder] Started recording to: ${outputPath}`);
    return outputPath;
  }

  async stopRecording(): Promise<string | null> {
    if (!this.isRecording) {
      return null;
    }

    // Stop recording and get the audio data
    const audioData = await this.page.evaluate(async () => {
      return new Promise<string>((resolve) => {
        // @ts-ignore
        const recorder = window.__audioRecorder;
        if (!recorder) {
          resolve('');
          return;
        }

        recorder.onstop = async () => {
          // @ts-ignore
          const chunks = window.__audioChunks;
          const blob = new Blob(chunks, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve(reader.result as string);
          };
          reader.readAsDataURL(blob);
        };

        recorder.stop();
      });
    });

    if (audioData && this.outputPath) {
      // Write the audio data to file
      const { writeFile } = await import('fs/promises');
      const base64Data = audioData.split(',')[1];
      if (base64Data) {
        await writeFile(this.outputPath, Buffer.from(base64Data, 'base64'));
      }
    }

    const outputPath = this.outputPath;
    this.isRecording = false;
    this.outputPath = null;

    console.log(`[AudioRecorder] Stopped recording. Saved to: ${outputPath}`);
    return outputPath;
  }
}
