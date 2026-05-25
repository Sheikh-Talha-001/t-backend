// server/config/db.js
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!uri) {
            throw new Error('MongoDB connection URI not found in environment variables.');
        }
        const conn = await mongoose.connect(uri);
        console.log(`Successfully connected to MongoDB.`);
    } catch (error) {
        console.error(`Error: ${error.message} ❌`);
        process.exit(1); // Exit process with failure
    }
};

module.exports = connectDB;