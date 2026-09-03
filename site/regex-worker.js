const MAX_PATTERN = 2048;
const MAX_SAMPLE = 100000;
const MAX_MATCHES = 1000;

self.onmessage = ({ data }) => {
  const { id, pattern, flags, samples } = data;
  try {
    if (typeof pattern !== 'string' || pattern.length > MAX_PATTERN) throw new Error('Pattern exceeds the 2,048 character bound.');
    const expression = new RegExp(pattern, flags);
    const results = samples.map((sample) => {
      const value = String(sample).slice(0, MAX_SAMPLE);
      expression.lastIndex = 0;
      const matched = expression.test(value);
      expression.lastIndex = 0;
      return matched;
    });
    self.postMessage({ id, ok: true, results });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error?.message || error) });
  }
};
