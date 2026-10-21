// Lossless transport for repeated forecast objects and diagnostic strings.
// Decoding expands references to separate objects, matching JSON.parse semantics.
export function packInlineState(root) {
  const nodes = [], keys = [], keyIds = new Map(), objects = new WeakMap(), strings = new Map(), structures = new Map(), active = new WeakSet();
  function encode(value) {
    if (typeof value === 'string' && value.length > 128) {
      if (strings.has(value)) return [strings.get(value)];
      const id = nodes.length;
      strings.set(value, id);
      nodes.push([2, value]);
      return [id];
    }
    if (value === null || typeof value !== 'object') {
      if (typeof value === 'bigint') throw new TypeError('BigInt cannot be serialized');
      if (typeof value === 'number' && !Number.isFinite(value)) return null;
      return value;
    }
    if (typeof value.toJSON === 'function') return encode(value.toJSON());
    if (active.has(value)) throw new TypeError('Circular inline state');
    if (objects.has(value)) return [objects.get(value)];
    const array = Array.isArray(value);
    active.add(value);
    const node = [array ? 1 : 0, []];
    if (array) node[1] = Array.from(value, item => encode(item) ?? null);
    else for (const [key, item] of Object.entries(value)) {
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol') continue;
      if (!keyIds.has(key)) { keyIds.set(key, keys.length); keys.push(key); }
      node[1].push(keyIds.get(key), encode(item));
    }
    active.delete(value);
    const signature = JSON.stringify(node);
    let id = structures.get(signature);
    if (id === undefined) {
      id = nodes.length;
      nodes.push(node);
      structures.set(signature, id);
    }
    objects.set(value, id);
    return [id];
  }
  const value = encode(root);
  return { value, nodes, keys };
}

// Self-contained: embedded in the HTML so hydration needs no additional request.
export function unpackInlineState(packed) {
  function decode(value) {
    if (!Array.isArray(value)) return value;
    const [kind, data] = packed.nodes[value[0]];
    if (kind === 2) return data;
    if (kind === 1) return data.map(decode);
    const entries = [];
    for (let i = 0; i < data.length; i += 2) entries.push([packed.keys[data[i]], decode(data[i + 1])]);
    return Object.fromEntries(entries);
  }
  return decode(packed.value);
}
