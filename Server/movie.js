const express = require("express");
const app = express();
const fs = require("fs");

const multer = require('multer');
// for file uploading

const session = require('express-session');
// to help with user sessions to keep them while moving from one page to the other

const path = require("path");
//this helps with differemt file paths

const cors = require("cors");
// this helps prevent malicious requests and enhance security

const dotenv = require("dotenv").config();
//helps with config management and security

const PORT = process.env.PORT || 8000;

app.use(cors());


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionSecret = process.env.SESSION_SECRET || 'default-secret-key';
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));


//REQUIRE THE DB SERVICE
const dbService = require('./dbService.js'); 
const db = dbService.getDbServiceInstance();


app.use('/assets', express.static(path.join(__dirname, '..', 'Client', 'assets')));
app.use('/images', express.static(path.join(__dirname, '..', 'Client', 'images')));
app.use('/Client', express.static(path.join(__dirname, '..', 'Client')));


//delete
app.use((err, req, res, next) => {
  if (err.code === 'ENOENT') {
    console.error('File not found:', req.path);
    res.status(404).json({ error: 'File not found' });
  } else {
    next(err);
  }
});



app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(cors({
  origin: 'http://localhost:8000', // replace with your frontend URL
  credentials: true
}));


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
      const uploadDir = file.fieldname === 'movie' ? 'uploads/movies' : 'uploads/posters';
      cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'movie' && !file.mimetype.startsWith('video/')) {
      return cb(new Error('Only video files are allowed for movies'));
  }
  if (file.fieldname === 'poster' && !file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed for posters'));
  }
  cb(null, true);
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 1000 * 1024 * 1024 }, // 1000 MB limit
  fileFilter: fileFilter
});


const uploadDirs = ['uploads/movies', 'uploads/posters'];

uploadDirs.forEach(dir => {
    const fullPath = path.join(__dirname, dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`Created directory: ${fullPath}`);
    }
});

// Get all movies
app.get('/getAllMovies', (req, res) => {
  const query = 'SELECT * FROM movies';
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).json({ success: false, message: 'Error fetching movies', error: err });
    } else {
      res.json({ success: true, data: results });
    }
  });
});


app.get('/getMovie/:id', async (req, res) => {
  try {
      const movieId = req.params.id;
      const result = await db.getMovieById(movieId);
      
      if (result) {
          res.json({ success: true, data: result });
      } else {
          res.status(404).json({ success: false, message: 'Movie not found' });
      }
  } catch (error) {
      console.error('Error fetching movie:', error);
      res.status(500).json({ success: false, message: 'Error fetching movie', error: error.message });
  }
});


app.post('/insertMovie', (req, res) => {
  upload.fields([
      { name: 'movie', maxCount: 1 },
      { name: 'poster', maxCount: 1 }
  ])(req, res, (err) => {
      console.log('Received upload request');

      if (err) {
          console.error('Upload error:', err);
          return res.status(400).json({ success: false, message: 'Upload failed', error: err.message });
      }

      console.log('Received request for /insertMovie');
      console.log('Body:', req.body);
      console.log('Files:', req.files);

      if (!req.files || !req.files['movie'] || !req.files['poster']) {
          console.error('File upload failed: Files are missing');
          return res.status(400).json({ success: false, message: 'File upload failed. Movie and poster files are required.' });
      }

      const { title, genre, rdate, runtime, description, trailer_url } = req.body;
      const movieFile = req.files['movie'][0];
      const posterFile = req.files['poster'][0];

      if (!title || !genre || !rdate || !runtime || !description) {
          console.error('Missing required fields:', { title, genre, rdate, runtime, description });
          return res.status(400).json({ success: false, message: 'Missing required fields' });
      }

      const moviePath = movieFile.path;
      const posterPath = posterFile.path;

      console.log('Attempting to insert into database');
      
      // Send an initial response to prevent timeout
      res.writeHead(200, { 'Content-Type': 'application/json' });

      const query = 'INSERT INTO movies (title, genre, rdate, runtime, description, trailer_url, filepath, imgpath) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
      db.query(query, [title, genre, rdate, runtime, description, trailer_url, moviePath, posterPath], (dbErr, result) => {
          if (dbErr) {
              console.error('Database error:', dbErr);
              res.write(JSON.stringify({ success: false, message: 'Error inserting movie', error: dbErr.message }));
          } else {
              console.log('Movie inserted successfully');
              res.write(JSON.stringify({ success: true, message: 'Movie inserted successfully', id: result.insertId }));
          }
          res.end();
      });
  });
});


app.patch('/updateMovie/:id', async (req, res) => {
  const { title, genre, rdate, runtime, description, trailer_url } = req.body;

  // Ensure all fields are provided
  if (!title || !genre || !rdate || !runtime || !description) {
    console.error('Missing required fields:', { title, genre, rdate, runtime, description });
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  const updateFields = {
    title,
    genre,
    rdate,
    runtime,
    description,
    trailer_url
  };

  try {
    const success = await db.updateMovie(req.params.id, updateFields);

    if (success) {
      res.json({ success: true, message: 'Movie updated successfully' });
    } else {
      res.status(404).json({ success: false, message: 'Movie not found' });
    }
  } catch (error) {
    console.error('Error updating movie:', error);
    res.status(500).json({ success: false, message: 'Error updating movie', error: error.message });
  }
});




// Delete a movie
app.delete('/deleteMovie/:id', async (req, res) => {
  console.log(`Received delete request for movie ID: ${req.params.id}`);
  
  try {
    // Fetch the movie
    const movie = await db.fetchMovie(req.params.id);
    if (!movie) {
      console.log('Movie not found');
      return res.status(404).json({ success: false, message: 'Movie not found' });
    }
    console.log('Movie found:', movie);

    // Delete the movie from the database
    const deleted = await db.deleteMovie(req.params.id);
    if (!deleted) {
      return res.status(500).json({ success: false, message: 'Failed to delete movie from database' });
    }
    console.log('Movie deleted from database');

    // Delete associated files
    const fileErrors = [];
    
    const deleteFile = (path) => {
      return new Promise((resolve) => {
        fs.unlink(path, (err) => {
          if (err) {
            console.error(`Error deleting file ${path}:`, err);
            fileErrors.push(`Failed to delete file ${path}: ${err.message}`);
          } else {
            console.log(`File ${path} deleted successfully`);
          }
          resolve();
        });
      });
    };

    if (movie.filepath) {
      await deleteFile(movie.filepath);
    }

    if (movie.imgpath) {
      await deleteFile(movie.imgpath);
    }

    res.json({ 
      success: true, 
      message: 'Movie deleted successfully', 
      fileErrors: fileErrors.length > 0 ? fileErrors : undefined 
    });
  } catch (error) {
    console.error('Error in delete operation:', error);
    res.status(500).json({ success: false, message: 'Error deleting movie', error: error.message });
  }
});



// Search movies
app.get('/searchMovies', async (req, res) => {
  const { title, genre } = req.query;
  let query = 'SELECT * FROM movies WHERE 1=1';
  const params = [];

  if (title) {
    query += ' AND title LIKE ?';
    params.push(`%${title}%`);
  }
  if (genre) {
    query += ' AND genre LIKE ?';
    params.push(`%${genre}%`);
  }

  try {
    const results = await db.query(query, params);
    res.json({ success: true, data: results });
  } catch (err) {
    console.error('Error searching movies:', err);
    res.status(500).json({ success: false, message: 'Error searching movies', error: err.message });
  }
});





 app.get("/", function (req, res) {
  res.sendFile(path.join(__dirname, '..', 'Client', 'movie.html'));
});

// plan to start a session here, where when a user presses a mvies to watch it will be stored in the session and direct them to this page 
// where they can watch the video, the video path will be a variable in the session and the video info from the db too.

app.get("/video", function (req, res) {
  // Ensure there is a range given for the video
  const range = req.headers.range;
  if (!range) {
    return res.status(400).send("Requires Range header");
  }

  console.log('Range:', range);

  // get video stats (about 61MB)
  const videoPath = "uploads/movies/1726081504391.mp4";
  
  if (!fs.existsSync(videoPath)) {
    console.error(`Video file not found: ${videoPath}`);
    return res.status(404).send("Video not found");
  }

  const videoSize = fs.statSync(`${__dirname}/${videoPath}`).size;
  // Parse Range
  // Example: "bytes=32324-"
  const CHUNK_SIZE = 10 ** 6; // 1MB
  const start = Number(range.replace(/\D/g, ""));
  const end = Math.min(start + CHUNK_SIZE, videoSize - 1);

  console.log(`Streaming bytes ${start}-${end} of ${videoSize}`);

  // Create headers
  const contentLength = end - start + 1;
  const headers = {
    "Content-Range": `bytes ${start}-${end}/${videoSize}`,
    "Accept-Ranges": "bytes",
    "Content-Length": contentLength,
    "Content-Type": "video/mp4",
  };


  // HTTP Status 206 for Partial Content
  res.writeHead(206, headers);

  // create video read stream for this particular chunk
  const videoStream = fs.createReadStream(videoPath, { start, end });

  // Stream the video chunk to the client
  videoStream.on('open', () => {
    videoStream.pipe(res);
  });

  videoStream.on('error', (streamErr) => {
    console.error('Stream Error:', streamErr);
    res.end(streamErr);
  });
});



// app.listen(8000, function () {
//   console.log("Listening on port 8000!");
// });

app.listen(process.env.PORT, () => {
  console.log(`App is running on port ${process.env.PORT}`);
});


// new create
app.post('/insert', async (request, response) => {
  try {
      const db = dbService.getDbServiceInstance();
      const { fName, lName, email, password } = request.body;

      // Check if the email already exists in the database
      const existingUser = await db.getUserByEmail(email);

      if (existingUser) {
          // Email already exists
          return response.status(400).json({ success: false, message: 'Email already used' });
      }

      // Insert the new user into the database
      const result = await db.insertNewName(fName, lName, email, password);

      response.json({ success: true, data: result });
  } catch (err) {
      console.log(err);
      response.status(500).json({ success: false, message: err.message });
  }
});

// login


const bodyParser = require('body-parser');
app.use(bodyParser.json());

app.get('/api/admin-email', (req, res) => {
  res.json({ email: process.env.ADMIN_EMAIL });
});


app.post('/login', async (request, response) => {
  const db = dbService.getDbServiceInstance();
  const { email, password } = request.body;

  try {
      const query = 'SELECT * FROM user WHERE email = ? AND password = ?';
      const results = await db.query(query, [email, password]);

      if (results.length > 0) {
          // User found
          const user = results[0];
          request.session.userId = user.id;  // Store user ID in session
          response.status(200).json({ success: true });
      } else {
          // User not found
          response.status(401).json({ success: false, message: 'Invalid email or password' });
      }
  } catch (err) {
      console.error(err);
      response.status(500).json({ success: false, message: 'An error occurred, please try again.' });
  }
});

function checkAuth(req, res, next) {
  if (req.session.userId) {
    next(); // User is authenticated, allow them to access the route
  } else {
    res.status(401).json({ success: false, message: 'You are not authenticated' });
  }
}

app.get('/profile', checkAuth, (req, res) => {
  const userId = req.session.userId;
  // Fetch user profile from database using userId
  // Return profile data
});

app.post('/logout', (req, res) => {
  req.session.destroy(err => {
      if (err) {
          return res.status(500).json({ success: false, message: 'Logout failed' });
      }
      res.status(200).json({ success: true });
  });
});



//read
app.get('/getAll', async (request, response) => {
  try {
      const result = await db.getAllData();
      response.json({ data: result });
  } catch (err) {
      console.log(err);
      response.status(500).json({ success: false, message: err.message });
  }
});

app.get('/get/:id', (request, response) => {
  const { id } = request.params;
  const db = dbService.getDbServiceInstance();
  
  const result = db.getDataById(id);
  
  result
  .then(data => response.json({success: true, data: data}))
  .catch(err => console.log(err));
})

// update
app.patch('/update', async (request, response) => {
  try {
      const { id, fName, lName, email, password } = request.body;
      const result = await db.updateNameById(id, fName, lName, email, password);
      response.json({ success: result });
  } catch (err) {
      console.log(err);
      response.status(500).json({ success: false, message: err.message });
  }
});


// delete
app.delete('/delete/:id', async (request, response) => {
  try {
      const { id } = request.params;
      const result = await db.deleteRowById(id);
      response.json({ success: result });
  } catch (err) {
      console.log(err);
      response.status(500).json({ success: false, message: err.message });
  }
});


app.get('/search/:fName/:lName', async (request, response) => {
  try {
      const { fName, lName } = request.params;
      const result = await db.searchByName(fName, lName);
      response.json({ data: result });
  } catch (err) {
      console.log(err);
      response.status(500).json({ success: false, message: err.message });
  }
});



app.get("/signup.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'signup.html'));
 });

 app.get("/test.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'test.html'));
 });

app.get("/team.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'team.html'));
});

app.get("/index.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'index.html'));
});

app.get("/testimonials.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'testimonials.html'));
});

app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'login.html'));
});

app.get("/contacts.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'contacts.html'));
});

app.get("/movies.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'movies.html'));
});

app.get("/products.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'products.html'));
});

app.get("/test.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'test.html'));
});

app.get("/admin.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'admin.html'));
});

app.get("/users.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'Users.html'));
});

app.get("/UserProfile.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'UserProfile.html'));
});

app.get("*", (req, res) => {
  res.status(404).send("Page not found");
});
