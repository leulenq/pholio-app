const fs = require('fs');
const path = require('path');
const config = require('../../config');

/**
 * Storage Abstraction Layer
 * Handles file storage across different providers (Local, S3, GCS)
 */

class StorageFactory {
  constructor() {
    this.strategy = process.env.STORAGE_STRATEGY || (config.isServerless ? 'cloud' : 'local');
    this.localPath = config.uploadsDir || path.join(__dirname, '../../public/uploads');
  }

  /**
   * Get public URL for a storage key
   */
  getPublicUrl(key) {
    if (this.strategy === 'local') {
      return `/uploads/${key}`;
    }
    
    // Placeholder for cloud providers
    const bucket = process.env.STORAGE_BUCKET;
    if (this.strategy === 's3') {
      return `https://${bucket}.s3.amazonaws.com/${key}`;
    }
    if (this.strategy === 'gcs') {
      return `https://storage.googleapis.com/${bucket}/${key}`;
    }

    return `/uploads/${key}`; // Fallback
  }

  /**
   * Save a file to the configured strategy
   */
  async save(tempPath, destinationKey) {
    if (this.strategy === 'local') {
      const finalPath = path.join(this.localPath, destinationKey);
      
      // Ensure directory exists
      const dir = path.dirname(finalPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      await fs.promises.rename(tempPath, finalPath);
      return this.getPublicUrl(destinationKey);
    }

    // Cloud strategies require SDK integration (AWS/GCP)
    // To be implemented in next phase
    console.warn(`[Storage] Cloud strategy '${this.strategy}' not yet fully implemented. Falling back to local.`);
    return this.getPublicUrl(destinationKey);
  }
}

module.exports = new StorageFactory();
