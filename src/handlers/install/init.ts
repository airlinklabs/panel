import express from 'express';
import install from './install';
import logger from '../logger';

const app = express();
app.use(express.json());

const INSTALLATION_KEY =
  process.env.INSTALLATION_KEY || 'default-installation-key';

app.post('/install', async (req, res) => {
  const { key, email, password } = req.body;

  if (!key || !email || !password) {
    res
      .status(400)
      .json({ error: 'Missing required fields: key, email, and password.' });
    return;
  }

  try {
    if (key !== INSTALLATION_KEY) {
      res.status(403).json({ error: 'Invalid installation key.' });
      return;
    }

    await install.install(key, email, password);
    res
      .status(200)
      .json({ message: 'Installation successful. First user created.' });
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error('Error during installation:', error.message);
      res.status(400).json({ error: `Installation failed: ${error.message}` });
    } else {
      logger.error('Unknown error during installation:', error);
      res
        .status(500)
        .json({ error: 'Installation failed due to an unknown error.' });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.log(`Server is running on port ${PORT}`);
});
