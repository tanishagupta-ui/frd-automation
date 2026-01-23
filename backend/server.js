const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 5002; // Changed to 5001 to avoid macOS AirPlay/ControlCenter conflict


app.use(express.json());
// Ensure uploads directory exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
    console.log("Created uploads directory");
}

/* ✅ CORS requests */
app.use(cors()); // Allow all origins to fix Network IP issues

// app.options("*", cors()); // Removed for Express 5 compatibility

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/");
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
    },
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const validTypes = [
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ];
        if (!validTypes.includes(file.mimetype)) {
            return cb(new Error("Only Excel files allowed (.xls, .xlsx)"));
        }
        cb(null, true);
    },
});

app.post("/upload", (req, res) => {
    upload.single("checklist")(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            // A Multer error occurred when uploading.
            console.error("Multer Error:", err);
            return res.status(500).json({ message: "Multer upload error", error: err.message });
        } else if (err) {
            // An unknown error occurred when uploading.
            console.error("Unknown Upload Error:", err);
            return res.status(500).json({ message: "Unknown upload error", error: err.message });
        }

        // Everything went fine.
        if (!req.file) {
            console.error("No file received");
            return res.status(400).json({ message: "No checklist uploaded" });
        }

        console.log("File uploaded successfully:", req.file);
        res.status(200).json({ message: "Checklist uploaded successfully", file: req.file });
    });
});

app.use("/api", require("./routes/docRoute"));


const server = app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});

server.on('error', (error) => {
    console.error('Server error:', error);
});

// Prevent unhandled crashes
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
});

process.on('exit', (code) => {
    console.log(`Process exited with code: ${code}`);
});
