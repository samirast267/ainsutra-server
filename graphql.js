// GraphQL API layer (REST API এর ওপরে বসানো modern API layer)
const { buildSchema } = require('graphql');
const { createHandler } = require('graphql-http/lib/use/express');

const BASE = `http://127.0.0.1:${process.env.PORT || 3000}`;

const schema = buildSchema(`
  scalar JSON

  type LawyerPage {
    page: Int
    limit: Int
    total: Int
    totalPages: Int
    hasNext: Boolean
    hasPrev: Boolean
    items: JSON
  }

  type Query {
    health: String
    categories: JSON
    lawyers(page: Int = 1, limit: Int = 5, categoryId: String, district: String, proBono: Boolean, search: String): LawyerPage
    lawyer(id: ID!): JSON
  }

  type Mutation {
    createCase(title: String!, description: String!, categoryId: String!): JSON
  }
`);

async function rest(path, options) {
  const res = await fetch(BASE + path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `REST error ${res.status}`);
  return data;
}

const rootValue = {
  health: async () => (await rest('/api/health')).status,
  categories: async () => {
    const d = await rest('/api/categories');
    return Array.isArray(d) ? d : d.data ?? d;
  },
  lawyers: async (args) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(args)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
    const d = await rest('/api/lawyers?' + q.toString());
    return { ...d, items: d.data };
  },
  lawyer: async ({ id }) => rest('/api/lawyers/' + encodeURIComponent(id)),
  createCase: async (args) =>
    rest('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    }),
};

module.exports = createHandler({ schema, rootValue });
