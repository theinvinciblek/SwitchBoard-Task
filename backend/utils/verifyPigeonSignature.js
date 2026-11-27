
import crypto from "crypto";

const MAX_TIMESTAMP_AGE = 5 * 60;

const verifyPigeonSignature = (signatureHeader, rawBody, secret) => {
  try {
    if (!signatureHeader || !rawBody || !secret) {
      return false;
    }

    const parts = {};

    signatureHeader.split(",").forEach((part) => {
      const [key, value] = part.split("=");
      if (key && value) {
        parts[key.trim()] = value.trim();
      }
    });

    const timestamp = Number(parts.t);
    const receivedSignature = parts.v1;

    if (!Number.isFinite(timestamp) || !receivedSignature) {
      return false;
    }

    const currentTimestamp = Math.floor(Date.now() / 1000);

    if (Math.abs(currentTimestamp - timestamp) > MAX_TIMESTAMP_AGE) {
      return false;
    }

    const payload = `${timestamp}.${rawBody}`;

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    const receivedBuffer = Buffer.from(receivedSignature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
};

export default verifyPigeonSignature;
