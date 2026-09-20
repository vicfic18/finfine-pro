class FinFinePcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const maxDurationSeconds = options.processorOptions?.maxDurationSeconds ?? 30;
    this.maxSamples = Math.floor(sampleRate * maxDurationSeconds);
    this.capturedSamples = 0;
    this.stopping = false;
    this.port.onmessage = (event) => {
      if (event.data?.type === 'stop') this.stopping = true;
    };
  }

  process(inputs, outputs) {
    const output = outputs[0]?.[0];
    if (output) output.fill(0);
    if (this.stopping) {
      this.port.postMessage({ type: 'stopped' });
      return false;
    }

    const input = inputs[0]?.[0];
    if (!input?.length) return true;
    const remaining = this.maxSamples - this.capturedSamples;
    const copy = input.subarray(0, Math.max(0, remaining)).slice();
    if (copy.length) {
      this.capturedSamples += copy.length;
      this.port.postMessage({ type: 'samples', samples: copy.buffer }, [copy.buffer]);
    }
    if (this.capturedSamples >= this.maxSamples) {
      this.stopping = true;
      this.port.postMessage({ type: 'limit' });
    }
    return true;
  }
}

registerProcessor('finfine-pcm-capture', FinFinePcmCaptureProcessor);
