const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/games', require('./routes/games'));
app.use('/api/clubs', require('./routes/clubs'));
app.use('/api/matches', require('./routes/matches'));
app.use('/api/teams', require('./routes/teams'));
app.use('/api/friends', require('./routes/friends'));
app.use('/api/verify', require('./routes/verify'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Gaming Platform running at http://localhost:${PORT}`);
});
