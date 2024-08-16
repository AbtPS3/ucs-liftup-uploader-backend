/**
 * @file upload-controller.js
 * @module controllers/upload-controller
 * @description Controller class for handling CSV file upload logic.
 * @version 1.1.0
 * @autor Kizito S.M.
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import csvParser from "csv-parser";
import pkg from "csv-writer";
import streamifier from "streamifier";
import dotenv from "dotenv";
import CustomError from "../helpers/custom-error.js";
import response from "../helpers/response-handler.js";

dotenv.config();

const { createObjectCsvWriter } = pkg;
const currentModuleURL = new URL(import.meta.url);
const __dirname = dirname(fileURLToPath(currentModuleURL));

/**
 * Controller class for handling CSV file upload logic.
 * @class
 */
class UploadController {
  /**
   * Handles requests to the root path.
   * @param {Object} req - Express request object.
   * @param {Object} res - Express response object.
   * @param {Function} next - Express next middleware function.
   */
  async all(req, res, next) {
    try {
      const authenticated = !!req.decoded;
      const payload = {
        token: null,
        authenticated,
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
   */
  async create(req, res, next) {
    try {
      if (!req.file) throw new Error("No file provided!");

      const originalFileName = req.file.originalname;
      const fileNameParts = originalFileName.split("_");
      const uploadType = ["clients", "contacts", "results"].includes(fileNameParts[1]) ? fileNameParts[1] : null;
      const fileBuffer = req.file.buffer;
      const fileStream = streamifier.createReadStream(fileBuffer);

      // const [ctcNumbersResponse, elicitationNumbersResponse] = await Promise.all([
      //   fetch("http://localhost:8090/get-uploaded-ctc-numbers"),
      //   fetch("http://localhost:8091/get-uploaded-elicitation-numbers")
      // ]);

      // if (!ctcNumbersResponse.ok) throw new Error("CTC Deduplicator checker unavailable. Retry later!");
      // if (!elicitationNumbersResponse.ok) throw new Error("Elicitation Deduplicator checker unavailable. Retry later!");

      // const existingCtcNumbers = (await ctcNumbersResponse.json()).map(item => item.ctc_number);
      // const existingElicitationNumbers = (await elicitationNumbersResponse.json()).map(item => item.elicitation_number);

      // Fetch CTC Numbers from the provided endpoint
      const ctcNumbersResponse = await fetch("http://localhost:8090/get-uploaded-ctc-numbers");
      if (!ctcNumbersResponse.ok) {
        throw new Error("CTC Deuplicator checker unavailable. Retry later!");
      }
      const ctcNumbers = await ctcNumbersResponse.json();
      const existingCtcNumbers = ctcNumbers.map((item) => item.ctc_number);

      const results = [];
      const rejectedRows = [];
      const csvStream = csvParser({ headers: true });
      let isFirstRow = true;

      csvStream.on("data", (data) => {
        let rejectionReason = "";

        if (uploadType === "clients" && existingCtcNumbers.includes(data._0)) {
          rejectionReason = "Duplicate CTC number in clients file";
        } else if (["contacts", "results"].includes(uploadType) && !existingCtcNumbers.includes(data._12)) {
          rejectionReason = uploadType === "contacts" ? "No matching index client CTC number in contacts file" : "No matching index client CTC number in results file";
          // } else if (uploadType === "results" && existingElicitationNumbers.includes(data._13)) {
          //   rejectionReason = "Duplicate elicitation number in uploaded file";
          // }
        }

        if (rejectionReason) {
          data.rejectionReason = rejectionReason;
          rejectedRows.push(data);
        } else {
          if (isFirstRow) {
            data.providerId = "providerId";
            data.team = "team";
            data.teamId = "teamId";
            data.locationId = "locationId";
            isFirstRow = false;
          } else {
            data.providerId = req.decoded.data.providerId;
            data.team = req.decoded.data.team;
            data.teamId = req.decoded.data.teamId;
            data.locationId = req.decoded.data.locationId;
          }
          results.push(data);
        }
      });

      csvStream.on("end", async () => {
        if (results.length > 0) {
          let uploadDirectory;

          switch (uploadType) {
            case "clients":
              uploadDirectory = "index_uploads";
              break;
            case "contacts":
              uploadDirectory = "contacts_uploads";
              break;
            case "results":
              uploadDirectory = "results_uploads";
              break;
            default:
              throw new Error(`Invalid upload type: ${uploadType}`);
          }

          const filePath = join(__dirname, `../public/${uploadDirectory}`, originalFileName);
          const csvWriter = createObjectCsvWriter({
            path: filePath,
            header: Object.keys(results[0]),
            alwaysQuote: true,
          });

          await csvWriter.writeRecords(results);

          const rejected = rejectedRows.length > 0;

          const payload = {
            token: null,
            authenticated: true,
            message: "File uploaded, processed, and saved successfully!",
            rejected: rejected,
            rejectedRows: rejected ? rejectedRows.slice(1) : rejectedRows,
          };

          return response.api(req, res, 201, payload);
        } else {
          throw new CustomError("All rows were rejected.", 400);
        }
      });

      fileStream.pipe(csvStream);
    } catch (error) {
      console.error(error.message);
      next(error);
    }
  }
}

export default new UploadController();
