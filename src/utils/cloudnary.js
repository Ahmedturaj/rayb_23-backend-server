const cloudinaryModule = require("cloudinary");
const cloudinary = cloudinaryModule.v2;
const config = require("../config");
const multer = require("multer");

cloudinary.config({
  cloud_name: config.cloudinary.cloud_name,
  api_key: config.cloudinary.api_key,
  api_secret: config.cloudinary.api_secret,
});

const sendImageToCloudinary = (imageName, path) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      path,
      { public_id: imageName },
      function (error, result) {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
  });
};

// Multer storage configuration
const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, process.cwd() + "/uploads");
  },
  filename: function (_req, file, cb) {
    const uniqueSuffix = Date.now() + file.originalname;
    cb(null, file.fieldname + "-" + uniqueSuffix);
  },
});

const upload = multer({ storage: storage });

module.exports = {
  sendImageToCloudinary,
  upload,
};
