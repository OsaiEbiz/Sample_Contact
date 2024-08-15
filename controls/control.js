import Client from 'ssh2-sftp-client';
import fs from 'fs';
import XLSX from 'xlsx';
import path from 'path';

const sftp = new Client();

const config = {
    host: '52.140.102.243',
    port: '22',
    username: 'crm',
    password: '!@2tB(I2Q7-8'
};

const remoteFilePath = '/SSFL_CRM';
const localDownloadPath = './downloads';
const logFile = "processing_log.txt";
const failedDataFile = 'FailedData/failData.xlsx';
const successfulDataFile = 'successfulData/successfulData.json';

const excelBufferToJson = (buffer) => {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    return XLSX.utils.sheet_to_json(worksheet);
};

const ensureDirectoryExists = async (dir) => {
    if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
    }
};

const createContactInFreshdesk = async (element, basicAuth) => {
    const gender = element.Gender === "M" ? "Male" : element.Gender === "F" ? "Female" : "";
    const maritalStatus = element.MaritalStatus === "M" ? "Married" : element.MaritalStatus === "W" ? "Widow" : element.MaritalStatus === "S" ? "Single" : "";

    const payload = {
        "address": element.address,
        "mobile": parseInt(element.MobileNo) || null,
        "name": element.CustomerName,
        "custom_fields": {
            "customer_id": parseInt(element.CustomerId) || null,
            "village": element.village,
            "pincode": parseInt(element.PinCode) || null,
            "state": element.State,
            "district": element.District,
            "client_age": parseInt(element.ClientAge) || null,
            "kyc_1": element.kyc_1,
            "id_1": element.Id_1,
            "kcy_2": element.Kyc_2,
            "id_2": element.Id_2,
            "gender": gender,
            "dob": element.DateOfBirth,
            "marital_status": maritalStatus,
            "father_spouse_name": element.FatherSpouseName,
            "nominee_name": element.NomineeName,
            "nominee_age": parseInt(element.NomineeAge) || null,
            "nominee_kyc_id": element.NomineeKycId,
            "center_name": element.CenterName,
            "center_id": parseInt(element.CenterId) || null,
            "group_name": element.GroupName,
            "group_id": parseInt(element.GroupId) || null,
            "staff_id": parseInt(element.StaffId) || null,
            "house_hold_exp": parseInt(element.HouseholdExp) || null,
            "household_income": parseInt(element.HouseholdIncome) || null,
            "bank_account_number": element.BankAccountNumber,
            "bank_name": element.BankName
        }
    };

    try {
        const response = await fetch('https://osaiebiz-support.freshdesk.com/api/v2/contacts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': basicAuth
            },
            body: JSON.stringify(payload)
        });

        const logMessage = `Contact with CustomerId ${element.CustomerId} ${response.ok ? 'created successfully' : 'failed to create'}\n`;
        await fs.promises.appendFile(logFile, logMessage);

        if (!response.ok) {
            await ensureDirectoryExists(path.dirname(failedDataFile));
            const existingFailedData = XLSX.utils.sheet_to_json(XLSX.readFile(failedDataFile).Sheets[0]);
            const newFailedData = [...existingFailedData, element];
            const newWorkbook = XLSX.utils.book_new();
            const newWorksheet = XLSX.utils.json_to_sheet(newFailedData);
            XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, "FailedData");
            XLSX.writeFile(newWorkbook, failedDataFile);
        } else {
            await ensureDirectoryExists(path.dirname(successfulDataFile));
            await fs.promises.appendFile(successfulDataFile, JSON.stringify({ CustomerId: element.CustomerId }) + '\n', { flag: 'a' });
        }
    } catch (error) {
        console.error('Error creating contact:', error);
        await fs.promises.appendFile(logFile, `Error creating contact with CustomerId ${element.CustomerId}: ${error.message}\n`);
    }
};

export const listFilesAndProcess = async () => {
    try {
        await sftp.connect(config);
        const fileList = await sftp.list(remoteFilePath);
        const regex = /^SSFL_Customer_details(?:_Part[12])?\.xlsx$/;

        for (const file of fileList) {
            if (regex.test(file.name)) {
                const remoteFile = `${remoteFilePath}/${file.name}`;
                const localFile = path.join(localDownloadPath, file.name);

                // Download the file
                await sftp.get(remoteFile, localFile);
                console.log(`Downloaded: ${file.name}`);

                // Read and parse the Excel file
                const buffer = fs.readFileSync(localFile);
                const jsonData = excelBufferToJson(buffer);

                // Authenticate with Freshdesk
                const username = 'jCwqvXSmAEKjYMJqgjm2';
                const password = 'password';
                const basicAuth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

                // Process each record
                for (const element of jsonData) {
                    await createContactInFreshdesk(element, basicAuth);
                }

                // Delete the file after processing
                fs.unlinkSync(localFile);
                console.log(`Deleted: ${file.name}`);
            }
        }

        await sftp.end();
    } catch (err) {
        console.error('Error:', err.message);
    }
};
