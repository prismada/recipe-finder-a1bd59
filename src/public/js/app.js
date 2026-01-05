// Agent UI - Single file
const $ = id => document.getElementById(id);

let config = null;

async function runAgent(prompt) {
  const res = await fetch('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: prompt })
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.trim()) {
        try {
          const chunk = JSON.parse(line);
          if (chunk.type === 'text' || chunk.type === 'result') {
            $('content').textContent += chunk.text;
          } else if (chunk.type === 'tool') {
            $('statusText').textContent = `Using ${chunk.name}...`;
          } else if (chunk.type === 'usage') {
            const tokens = chunk.input + chunk.output;
            const cost = (chunk.input * 0.25 + chunk.output * 1.25) / 1e6;
            $('tokens').textContent = tokens;
            $('cost').textContent = cost.toFixed(4);
          } else if (chunk.type === 'done') {
            $('status').classList.remove('visible');
            $('btn').disabled = false;
            $('btn').textContent = config.buttonText || 'Send';
          }
        } catch {}
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const form = $('form');
  const input = $('input');
  const btn = $('btn');

  // Load config
  config = await fetch('/config.json').then(r => r.json());
  document.title = config.name;
  $('agentName').textContent = config.name;
  $('agentTagline').textContent = config.tagline;
  input.value = config.example;
  btn.textContent = config.buttonText || 'Send';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const prompt = input.value.trim();
    if (!prompt) return;

    btn.disabled = true;
    btn.textContent = config.workingText || 'Working...';
    $('content').textContent = '';
    $('status').classList.add('visible');
    $('statusText').textContent = config.statusText || 'Processing...';
    $('results').classList.add('visible');

    await runAgent(prompt);
  });
});
