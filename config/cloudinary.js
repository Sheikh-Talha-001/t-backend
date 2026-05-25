// server/config/cloudinary.js
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configure Cloudinary with credentials from .env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Multer storage for Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'silo_task_attachments',
    // resource_type: 'auto' is crucial! It allows uploading non-image files like PDFs, DOCX, etc.
    resource_type: 'auto',
    // allowed_formats can be configured if you want to restrict file types, e.g., ['jpg', 'png', 'pdf']
    // If not specified, Cloudinary will try to accept the format based on the file content.
  },
});

// Initialize Multer upload middleware with the configured storage
// We also set a file size limit of 5MB to protect server resources
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

module.exports = {
  cloudinary,
  upload,
};
