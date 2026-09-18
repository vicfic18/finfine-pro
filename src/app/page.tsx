'use client';

import { useState } from 'react';
import { uploadData, getUrl, list } from 'aws-amplify/storage';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>('');
  const [uploadedUrl, setUploadedUrl] = useState<string>('');
  const [uploadedKey, setUploadedKey] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [fileList, setFileList] = useState<string[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus('');
      setUploadedUrl('');
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setStatus('Please select a file first.');
      return;
    }

    try {
      setLoading(true);
      setStatus('Uploading to Amazon S3...');
      const cleanFileName = file.name.replace(/\s+/g, '_');
      const s3Path = `public/${Date.now()}-${cleanFileName}`;

      const uploadTask = uploadData({
        path: s3Path,
        data: file,
        options: {
          contentType: file.type,
        },
      });

      const response = await uploadTask.result;
      const key = response.path;
      setUploadedKey(key);
      setStatus(`Successfully uploaded! Key: ${key}`);

      const link = await getUrl({ path: key });
      setUploadedUrl(link.url.toString());
      setFile(null);
    } catch (err: unknown) {
      console.error('Error uploading file:', err);
      setStatus(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleListFiles = async () => {
    try {
      setStatus('Fetching uploaded files...');
      const result = await list({ path: 'public/' });
      const paths = result.items.map((item) => item.path);
      setFileList(paths);
      setStatus(`Found ${paths.length} file(s) in S3.`);
    } catch (err: unknown) {
      console.error('Error listing files:', err);
      setStatus(`Failed to list files: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <main>
      <h1>Amazon S3 File Uploader</h1>
      <p>Upload invoices, statements, or receipts directly to Amazon S3 using AWS Amplify Gen 2.</p>

      <form onSubmit={handleUpload}>
        <p>
          <label htmlFor="file-input">
            <strong>Choose file: </strong>
          </label>
          <input
            id="file-input"
            type="file"
            onChange={handleFileChange}
            disabled={loading}
          />
        </p>

        {file && (
          <p>
            Selected file: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
          </p>
        )}

        <p>
          <button type="submit" disabled={loading}>
            {loading ? 'Uploading...' : 'Upload to S3'}
          </button>
        </p>
      </form>

      {status && (
        <p>
          <strong>Status:</strong> {status}
        </p>
      )}

      {uploadedUrl && (
        <p>
          <strong>View Uploaded File: </strong>
          <a href={uploadedUrl} target="_blank" rel="noopener noreferrer">
            Open {uploadedKey}
          </a>
        </p>
      )}

      <hr />

      <section>
        <h2>Browse S3 Objects</h2>
        <button type="button" onClick={handleListFiles}>
          List S3 Files in public/
        </button>
        {fileList.length > 0 && (
          <ul>
            {fileList.map((path) => (
              <li key={path}>
                <code>{path}</code>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
