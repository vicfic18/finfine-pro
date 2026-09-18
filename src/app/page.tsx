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

      // Get a presigned URL to view/download the uploaded file
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
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h2>Amazon S3 File Uploader</h2>
      <p style={{ color: '#666' }}>Upload invoices, statements, or receipts directly to Amazon S3 using AWS Amplify Gen 2.</p>

      <form onSubmit={handleUpload} style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <input 
          type="file" 
          onChange={handleFileChange} 
          disabled={loading}
          style={{ display: 'block', marginBottom: '1rem' }}
        />
        <button 
          type="submit" 
          disabled={!file || loading}
          style={{ padding: '0.5rem 1rem', cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Uploading...' : 'Upload to S3'}
        </button>
      </form>

      {status && (
        <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f0f0f0', border: '1px solid #ccc' }}>
          <strong>Status:</strong> {status}
        </div>
      )}

      {uploadedUrl && (
        <div style={{ marginTop: '1rem' }}>
          <p><strong>View Uploaded File:</strong></p>
          <a href={uploadedUrl} target="_blank" rel="noopener noreferrer">
            Open {uploadedKey}
          </a>
        </div>
      )}

      <hr style={{ margin: '2rem 0' }} />

      <div>
        <h3>Browse S3 Objects</h3>
        <button onClick={handleListFiles} style={{ padding: '0.4rem 0.8rem', cursor: 'pointer' }}>
          List S3 Files in &quot;public/&quot;
        </button>
        {fileList.length > 0 && (
          <ul style={{ marginTop: '1rem' }}>
            {fileList.map((path) => (
              <li key={path}>
                <code>{path}</code>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
