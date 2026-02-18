import express from "express";
import piexif from "piexifjs";

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON bodies up to 100MB
app.use(express.json({ limit: "100mb" }));

// CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
});

// Encode string to UCS-2 LE byte array (required for XP* EXIF tags)
function encodeUCS2(str) {
    const arr = [];
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        arr.push(code & 0xff);
        arr.push((code >> 8) & 0xff);
    }
    arr.push(0, 0);
    return arr;
}

// Health check
app.get("/", (req, res) => {
    res.json({ status: "ok", service: "iptc-api" });
});

// Main embed endpoint
app.post("/api/embed", (req, res) => {
    try {
        const { image, title, description, keywords } = req.body;

        if (!image) {
            return res.status(400).json({ error: "Missing 'image' field" });
        }

        if (typeof image !== "string") {
            return res.status(400).json({
                error: "The 'image' field must be a base64 string (got " + typeof image + ")"
            });
        }

        // Strip data URI prefix to get raw base64
        let rawBase64 = image;
        let hadPrefix = false;
        if (image.startsWith("data:image/jpeg;base64,") || image.startsWith("data:image/jpg;base64,")) {
            rawBase64 = image.split(",")[1];
            hadPrefix = true;
        } else if (image.startsWith("data:image/")) {
            return res.status(400).json({
                error: "Only JPEG images are supported. Received: " + image.substring(0, 30)
            });
        }

        if (!rawBase64 || rawBase64.length < 100) {
            return res.status(400).json({
                error: "Image data is empty or too short. Length: " + (rawBase64 ? rawBase64.length : 0)
            });
        }

        // Reconstruct full data URI for piexif
        const imageInput = "data:image/jpeg;base64," + rawBase64;

        const exifObj = { "0th": {}, "Exif": {}, "GPS": {}, "Interop": {}, "1st": {}, "thumbnail": null };

        exifObj["0th"][piexif.ImageIFD.ImageDescription] = description || "";
        exifObj["0th"][piexif.ImageIFD.XPTitle] = encodeUCS2(title || "");
        exifObj["0th"][piexif.ImageIFD.XPKeywords] = encodeUCS2(keywords || "");

        const exifBytes = piexif.dump(exifObj);
        const inserted = piexif.insert(exifBytes, imageInput);

        if (hadPrefix) {
            res.json({ image: inserted });
        } else {
            res.json({ image: inserted.split(",")[1] });
        }
    } catch (err) {
        console.error("Embed error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`IPTC API running on port ${PORT}`);
});
