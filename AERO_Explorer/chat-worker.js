// Dedicated CPU worker. The client cancels by terminating it, including during model downloads.
let generator = null, runtime = null, busy = false;
function send(type, id, values = {}) { self.postMessage({type, id, ...values}); }
self.onmessage = async ({data}) => {
  const {type, id} = data;
  if (busy) { send('error', id, {message: 'AI worker busy'}); return; }
  busy = true;
  try {
    if (type === 'load') {
      const {model, modelBase} = data;
      runtime ||= await import('./transformers-3.8.1.min.js');
      const {env, pipeline} = runtime;
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      env.backends.onnx.wasm.numThreads = 1;
      env.backends.onnx.wasm.proxy = false;
      env.backends.onnx.wasm.wasmPaths = new URL('./', import.meta.url).href;
      if (modelBase) {
        env.remoteHost = new URL(modelBase.endsWith('/') ? modelBase : `${modelBase}/`, import.meta.url).href;
        env.remotePathTemplate = '{model}/';
      } else { env.remoteHost = 'https://huggingface.co/'; env.remotePathTemplate = '{model}/resolve/{revision}/'; }
      generator = await pipeline('text-generation', model.repo, {
        device: 'wasm', dtype: model.dtype, revision: model.revision,
        progress_callback: p => send('progress', id, {progress: {status: p.status, file: p.file || '', progress: Number(p.progress) || 0, loaded: Number(p.loaded) || 0, total: Number(p.total) || 0}}),
      });
      send('ready', id);
    } else if (type === 'generate') {
      if (!generator) throw new Error('Load a model first');
      const streamer = new runtime.TextStreamer(generator.tokenizer, {skip_prompt: true, skip_special_tokens: true, callback_function: text => send('token', id, {text})});
      const output = await generator(data.messages, {
        max_new_tokens: Math.min(112, Math.max(16, Number(data.maxNewTokens) || 96)),
        do_sample: false, repetition_penalty: 1.08, streamer,
      });
      const generated = output?.[0]?.generated_text;
      const text = Array.isArray(generated) ? generated.at(-1)?.content : generated;
      send('result', id, {text: typeof text === 'string' ? text : ''});
    } else throw new Error('Unknown AI operation');
  } catch (error) { send('error', id, {message: String(error?.message || error).slice(0, 240)}); }
  finally { busy = false; }
};
