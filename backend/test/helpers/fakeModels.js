// Minimal in-memory stand-in for the Mongoose calls used by the analysis pipeline,
// so the real pipeline code can be exercised end to end without a database.
const crypto = require('crypto');

const eq = (a, b) => String(a) === String(b);

function matchValue(v, cond) {
  if (cond && typeof cond === 'object' && !Array.isArray(cond) && Object.keys(cond).some(k => k.startsWith('$'))) {
    return Object.entries(cond).every(([op, x]) => {
      switch (op) {
        case '$gte': return v >= x;
        case '$lte': return v <= x;
        case '$gt':  return v > x;
        case '$lt':  return v < x;
        case '$ne':  return !eq(v, x);
        case '$in':  return x.some(y => eq(v, y));
        case '$nin': return !x.some(y => eq(v, y));
        default: throw new Error(`fake db: unsupported operator ${op}`);
      }
    });
  }
  return eq(v, cond);
}
const matches = (doc, q = {}) => Object.entries(q).every(([k, c]) => matchValue(doc[k], c));

class Query {
  constructor(run) { this.run = run; this._sort = null; this._limit = null; }
  sort(spec) { this._sort = spec; return this; }
  limit(n) { this._limit = n; return this; }
  select() { return this; }
  lean() { return this; }
  exec() {
    let rows = this.run();
    const single = !Array.isArray(rows);
    if (single) return Promise.resolve(rows);
    if (this._sort) {
      const [[k, dir]] = Object.entries(this._sort);
      rows = [...rows].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * dir);
    }
    if (this._limit != null) rows = rows.slice(0, this._limit);
    return Promise.resolve(rows);
  }
  then(res, rej) { return this.exec().then(res, rej); }
}

function makeStore() {
  const rows = [];
  const wrap = (row) => Object.assign(row, { save: async () => row });
  return {
    rows,
    find: (q) => new Query(() => rows.filter(r => matches(r, q))),
    findOne: (q) => {
      const query = new Query(() => rows.filter(r => matches(r, q)));
      const exec = query.exec.bind(query);
      query.exec = () => exec().then(list => list[0] || null);
      return query;
    },
    exists: async (q) => rows.some(r => matches(r, q)) || null,
    create: async (doc) => { const row = wrap({ _id: crypto.randomUUID(), ...doc }); rows.push(row); return row; },
    findOneAndUpdate: async (q, update, opts = {}) => {
      let row = rows.find(r => matches(r, q));
      if (!row && opts.upsert) { row = wrap({ _id: crypto.randomUUID(), ...q }); rows.push(row); }
      if (row) Object.assign(row, update);
      return row || null;
    },
    updateOne: async (q, update) => { const row = rows.find(r => matches(r, q)); if (row) Object.assign(row, update); },
    updateMany: async (q, update) => { rows.filter(r => matches(r, q)).forEach(r => Object.assign(r, update)); },
    deleteOne: async (q) => { const i = rows.findIndex(r => matches(r, q)); if (i >= 0) rows.splice(i, 1); },
    distinct: async (field, q) => [...new Set(rows.filter(r => matches(r, q)).map(r => r[field]))]
  };
}

// Replaces the static methods of the given Mongoose models with in-memory versions.
function install(models) {
  const stores = {};
  for (const [name, Model] of Object.entries(models)) {
    const store = makeStore();
    for (const fn of ['find', 'findOne', 'exists', 'create', 'findOneAndUpdate', 'updateOne', 'updateMany', 'deleteOne', 'distinct']) {
      Model[fn] = store[fn];
    }
    stores[name] = store;
  }
  return stores;
}

module.exports = { install };
