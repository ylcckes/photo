/**
 * 快樂小學堂・雲端相簿 - 後端 API (修正版)
 */

const DB_SHEET_NAME = "相片上傳紀錄";
const DB_HEADERS = ["時間戳記", "相簿名稱 (資料夾)", "檔案名稱", "檔案類型", "檔案 ID", "預覽連結"];

function doGet(e) {
  const params = e.parameter;
  const action = params.action;
  let result = {};

  try {
    if (action === "getAlbums") {
      result = getAlbumData();
    } else if (action === "shortenUrl") {
      result = proxyShortenUrl(params.longUrl);
    } else {
      result = { status: "error", message: "未知的請求動作" };
    }
  } catch (err) {
    result = { status: "error", message: err.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let result = {};
  try {
    initDatabase();
    const postData = JSON.parse(e.postData.contents);
    const albumName = postData.albumName; 
    const fileName = postData.fileName;
    const base64Data = postData.image;

    const rootFolder = getRootFolder();
    let albumFolder;
    const folders = rootFolder.getFoldersByName(albumName);
    if (folders.hasNext()) {
      albumFolder = folders.next();
    } else {
      albumFolder = rootFolder.createFolder(albumName);
    }

    const contentType = base64Data.substring(5, base64Data.indexOf(';'));
    const bytes = Utilities.base64Decode(base64Data.substring(base64Data.indexOf(',') + 1));
    const blob = Utilities.newBlob(bytes, contentType, fileName);
    const file = albumFolder.createFile(blob);
    
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(DB_SHEET_NAME);
    // 使用建構的 URL
    const fileUrl = "https://lh3.googleusercontent.com/d/" + file.getId() + "=s800";

    sheet.appendRow([new Date(), albumName, fileName, contentType, file.getId(), fileUrl]);
    result = { status: "success", message: "上傳成功", fileUrl: fileUrl };
  } catch (err) {
    result = { status: "error", message: err.toString() };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function getAlbumData() {
  const rootFolder = getRootFolder();
  const albums = [];
  const subFolders = rootFolder.getFolders();
  
  while (subFolders.hasNext()) {
    const folder = subFolders.next();
    const folderName = folder.getName();
    const folderId = folder.getId();
    const photos = [];
    const files = folder.getFiles();
    
    while (files.hasNext()) {
      const file = files.next();
      const mimeType = file.getMimeType();
      
      if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) {
        // 修正：手動建構預覽圖 URL，解決 getThumbnailLink 錯誤
        // lh3.googleusercontent.com/d/{ID}=s800 可以取得寬度 800px 的縮圖
        const url = "https://lh3.googleusercontent.com/d/" + file.getId() + "=s800";

        photos.push({
          id: file.getId(),
          name: file.getName(),
          type: mimeType,
          url: url, 
          downloadUrl: file.getDownloadUrl()
        });
      }
    }
    
    if (photos.length > 0) {
      albums.push({
        id: folderId,
        name: folderName,
        cover: photos[0].url,
        photos: photos
      });
    }
  }
  return { status: "success", data: albums };
}

function getRootFolder() {
  const ssId = SpreadsheetApp.getActiveSpreadsheet().getId();
  const file = DriveApp.getFileById(ssId);
  const parents = file.getParents();
  if (parents.hasNext()) {
    return parents.next();
  } else {
    throw new Error("找不到試算表所在的父資料夾");
  }
}

function initDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(DB_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(DB_SHEET_NAME);
    sheet.appendRow(DB_HEADERS);
  }
}

function proxyShortenUrl(longUrl) {
  if (!longUrl) return { status: "error", message: "無效的網址" };
  const apiUrl = `https://is.gd/create.php?format=json&url=${encodeURIComponent(longUrl)}`;
  try {
    const response = UrlFetchApp.fetch(apiUrl, { muteHttpExceptions: true });
    const json = JSON.parse(response.getContentText());
    if (json.shorturl) {
      return { status: "success", shortUrl: json.shorturl };
    } else {
      return { status: "error", message: "縮網址失敗", details: json };
    }
  } catch (e) {
    return { status: "error", message: "API 連線失敗", error: e.toString() };
  }
}