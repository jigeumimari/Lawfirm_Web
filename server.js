
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;


let currentUser = {
  email: 'steve@example.com'
};

app.use(cors());
app.use(bodyParser.json());


app.post('/login', (req, res) => {
  const { email } = req.body;
  if (email) {
    currentUser.email = email;
    return res.json({ success: true, email });
  }
  res.status(400).json({ success: false, message: 'Email required' });
});


app.get('/user', (req, res) => {
  res.json({ email: currentUser.email });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
