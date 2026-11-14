const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', require('./auth'));

// ---- Seed data ----
const categories = [
  { id: 1, name: 'Family Law' },
  { id: 2, name: 'Property Law' },
  { id: 3, name: 'Labour Law' },
  { id: 4, name: 'Consumer Rights' },
  { id: 5, name: 'Criminal Law' },
];

const districts = ['Dhaka', 'Chattogram', 'Rajshahi', 'Khulna', 'Sylhet'];
const names = ['Rahim', 'Karim', 'Nusrat', 'Farhana', 'Imran', 'Tania', 'Sabbir', 'Mou',
  'Arif', 'Shirin', 'Habib', 'Lipi', 'Jamal', 'Rupa', 'Tanvir', 'Sumi', 'Faisal', 'Nila',
  'Rasel', 'Mitu', 'Kabir', 'Dola', 'Anis', 'Popy'];

const lawyers = names.map((n, i) => ({
  id: i + 1,
  name: `Adv. ${n} ${['Ahmed', 'Hossain', 'Islam', 'Khan'][i % 4]}`,
  categoryId: (i % categories.length) + 1,
  district: districts[i % districts.length],
  experienceYears: 2 + (i * 3) % 18,
  isProBono: i % 2 === 0,
  rating: Number((3 + ((i * 7) % 21) / 10).toFixed(1)),
}));

// ---- Routes ----
app.get('/api/health', (req, res) => res.json({ status: 'ok', app: 'AinSutra API' }));

app.get('/api/categories', (req, res) => res.json(categories));

// GET /api/lawyers?page=1&limit=5&categoryId=2&district=Dhaka&proBono=true&search=rahim
app.get('/api/lawyers', (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 5, 1), 50);
  const { categoryId, district, proBono, search } = req.query;

  let result = lawyers;
  if (categoryId) result = result.filter((l) => l.categoryId === Number(categoryId));
  if (district) result = result.filter((l) => l.district === district);
  if (proBono === 'true') result = result.filter((l) => l.isProBono);
  if (search) result = result.filter((l) => l.name.toLowerCase().includes(search.toLowerCase()));

  const total = result.length;
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const start = (page - 1) * limit;

  res.json({
    page, limit, total, totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    data: result.slice(start, start + limit),
  });
});

app.get('/api/lawyers/:id', (req, res) => {
  const lawyer = lawyers.find((l) => l.id === Number(req.params.id));
  if (!lawyer) return res.status(404).json({ error: 'Lawyer not found' });
  res.json(lawyer);
});

// POST /api/cases
const cases = [];
app.post('/api/cases', (req, res) => {
  const { title, description, categoryId, urgency, district } = req.body;
  if (!title || !description || !categoryId) {
    return res.status(400).json({ error: 'title, description and categoryId are required' });
  }
  const newCase = {
    id: cases.length + 1, title, description, categoryId: Number(categoryId),
    urgency: urgency || 'low', district: district || null, status: 'open',
    createdAt: new Date().toISOString(),
  };
  cases.push(newCase);
  res.status(201).json(newCase);
});

app.get('/api/cases', (req, res) => res.json(cases));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`AinSutra API running on port ${PORT}`));