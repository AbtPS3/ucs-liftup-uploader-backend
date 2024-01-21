/**
 * @file upload-controller.js
 * @module controllers/upload-controller
 * @description Controller class for handling CSV file upload logic.
 * @version 1.0.1
 * @author Kizito S.M.
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import csvParser from "csv-parser";
import pkg from "csv-writer";
import streamifier from "streamifier";
import dotenv from "dotenv";
dotenv.config();

import CustomError from "../helpers/custom-error.js";
import response from "../helpers/response-handler.js";

// Get the current module's URL
const currentModuleURL = new URL(import.meta.url);
// Get the directory name
const __dirname = dirname(fileURLToPath(currentModuleURL));
// Destructure the csv-writer package
const { createObjectCsvWriter } = pkg;

/**
 * Controller class for handling CSV file upload logic.
 * @class
 */
class UploadController {
  /**
   * Constructor for UploadController.
   * @constructor
   */
  constructor() {
    // Set the current directory name
    this.__dirname = dirname(fileURLToPath(currentModuleURL));
  }

  /**
   * Handles requests to the root path.
   * @param {Object} req - Express request object.
   * @param {Object} res - Express response object.
   * @param {Function} next - Express next middleware function.
   * @returns {Object} - JSON response containing the message and authentication status.
   */
  async all(req, res, next) {
    try {
      // Check if the request is authenticated
      const authenticated = req.decoded ? true : false;

      // Response payload
      const payload = {
        token: null,
        authenticated: authenticated,
        message: "Root path reached",
      };

      return response.api(req, res, 200, payload);
    } catch (error) {
      console.error(error.message);
      next(error);
    }
  }

  /**
   * Handles file uploads and processes the CSV file.
   * @param {Object} req - Express request object.
   * @param {Object} res - Express response object.
   * @param {Function} next - Express next middleware function.
   * @returns {Object} - JSON response containing the message and authentication status.
   */
  async create(req, res, next) {
    try {
      // Check if a file is provided in the request
      if (!req.file) {
        throw new Error("No file provided!");
      }

      // Capture the original file name to determine if it's for clients or contacts
      const originalFileName = req.file.originalname;
      const fileNameParts = originalFileName.split("_");
      const uploadType =
        fileNameParts[1] === "clients" || fileNameParts[1] === "contacts" ? fileNameParts[1] : null;

      const fileBuffer = req.file.buffer;

      // Convert the buffer to a readable stream using streamifier
      const fileStream = streamifier.createReadStream(fileBuffer);

      // Process the uploaded CSV file
      const results = [];
      const csvStream = csvParser({ headers: true });

      // Flag to check if it's the first row
      let isFirstRow = true;
      csvStream.on("data", (data) => {
        // Check if it's the first row
        if (isFirstRow) {
          // Add the specified columns to the header row
          data.providerId = "providerId";
          data.team = "team";
          data.teamId = "teamId";
          data.locationId = "locationId";

          // Update the flag to false for subsequent rows
          isFirstRow = false;
        } else {
          // For every other row, obtain the data from the decoded token
          data.providerId = req.decoded.data.providerId;
          data.team = req.decoded.data.team;
          data.teamId = req.decoded.data.teamId;
          data.locationId = req.decoded.data.locationId;
        }

        // Push the processed data to the results array
        results.push(data);
      });

      // Event handler when the CSV stream ends
      csvStream.on("end", async () => {
        // Check if there is data available
        if (results.length > 0) {
          // Determine the upload directory based on the uploadType
          let uploadDirectory;

          if (uploadType === "clients") {
            uploadDirectory = "index_uploads";
          } else if (uploadType === "contacts") {
            uploadDirectory = "contacts_uploads";
          } else {
            console.error("UploadType:", uploadType);
            return response.api(req, res, 201, "Upload type is null!" + req.file.originalname);
          }

          // Set the filePath based on the determined upload directory
          const filePath = join(__dirname, `../public/${uploadDirectory}`, originalFileName);

          // Create a CSV writer instance
          const csvWriter = createObjectCsvWriter({
            path: filePath,
            header: Object.keys(results[0]), // Use the keys from the first row as headers
            alwaysQuote: true, // Ensure all values are quoted
          });

          // Write records to the CSV file
          await csvWriter.writeRecords(results);

          // Response payload
          const payload = {
            token: null,
            authenticated: true,
            message: "File uploaded, processed, and saved successfully!",
          };

          return response.api(req, res, 201, payload);
        } else {
          throw new CustomError("No data available to write to CSV.", 400);
        }
      });

      // Process the uploaded CSV file using the readable stream
      fileStream.pipe(csvStream);
    } catch (error) {
      console.error(error.message);
      next(error);
    }
  }
}

export default new UploadController();
