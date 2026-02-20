import React, { useRef, useState, useEffect } from "react";
import "./App.css";
import axios from "axios";

// SVG Icons
const UploadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const FileIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const PDFIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

function App() {
  const [selectedProduct, setSelectedProduct] = useState(null);
  const fileInputRef = useRef(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [latestFrd, setLatestFrd] = useState(null);
  const [checkingFrd, setCheckingFrd] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('frd-theme') || 'dark');

  useEffect(() => {
    localStorage.setItem('frd-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const products = [
    { name: "Route", color: "#6366f1" },
    { name: "Subscriptions", color: "#8b5cf6" },
    { name: "QR Code", color: "#06b6d4" },
    { name: "NCApps", color: "#0ea5e9" },
    { name: "Affordability Widget", color: "#10b981" },
    { name: "Smart Collect", color: "#f59e0b" },
    { name: "Charge at Will", color: "#ef4444" },
    { name: "Standard Checkout", color: "#6366f1" },
    { name: "Custom Checkout", color: "#8b5cf6" },
    { name: "S2S", color: "#ec4899" },
    { name: "Payment Links", color: "#14b8a6" },
  ];

  const openFilePicker = () => {
    if (!selectedProduct) {
      setMessage("Please select a product first.");
      setMessageType("error");
      return;
    }
    fileInputRef.current.click();
  };

  const processFile = async (file) => {
    if (!file) return;
    if (!selectedProduct) {
      setMessage("Please select a product first.");
      setMessageType("error");
      return;
    }
    const isExcelExtension = file.name.endsWith(".xls") || file.name.endsWith(".xlsx");
    if (!isExcelExtension) {
      setMessage("Invalid file type. Please upload an .xls or .xlsx file.");
      setMessageType("error");
      return;
    }

    const formData = new FormData();
    formData.append("product", selectedProduct);
    formData.append("checklist", file);

    setIsLoading(true);
    setUploadDone(false);
    setLatestFrd(null);
    setMessage("Processing your checklist...");
    setMessageType("info");

    try {
      const res = await axios.post("http://localhost:5001/upload", formData);
      setMessage(res.data.message || "Checklist uploaded successfully.");
      setMessageType("success");
      setUploadDone(true);
      pollForFrd();
    } catch (error) {
      setMessage(error.response?.data?.message || "Upload failed. Please try again.");
      setMessageType("error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e) => {
    processFile(e.target.files[0]);
    e.target.value = "";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    processFile(e.dataTransfer.files[0]);
  };

  const pollForFrd = async () => {
    setCheckingFrd(true);
    let attempts = 0;
    const poll = async () => {
      try {
        const res = await axios.get("http://localhost:5001/api/latest-frd");
        if (res.data?.filename) {
          setLatestFrd(res.data);
          setCheckingFrd(false);
          return;
        }
      } catch (_) { }
      attempts++;
      if (attempts < 20) setTimeout(poll, 2000);
      else setCheckingFrd(false);
    };
    setTimeout(poll, 3000);
  };

  const handleDownloadFrd = () => {
    if (!latestFrd) return;
    const link = document.createElement("a");
    link.href = `http://localhost:5001${latestFrd.url}`;
    link.download = latestFrd.filename;
    link.click();
  };

  return (
    <div className="app-root" data-theme={theme}>
      {/* Subtle grid background */}
      <div className="bg-grid" />
      <div className="bg-glow" />

      <div className="layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            <div className="sidebar-logo-mark">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="sidebar-brand">FRD Studio</span>
          </div>

          <nav className="sidebar-nav">
            <div className="nav-item active">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
              </svg>
              <span>New Audit</span>
            </div>
          </nav>

          <div className="sidebar-footer">
            <div className="sidebar-user">
              <div className="user-avatar">T</div>
              <span>Tanisha G.</span>
            </div>
            <button className="theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
              {theme === 'dark' ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="main">
          <div className="page-header">
            <div>
              <div className="breadcrumb">Audits / New</div>
              <h1 className="page-title">Generate FRD</h1>
              <p className="page-desc">Upload your audit checklist to automatically generate a Feature Requirements Document.</p>
            </div>
            <div className="progress-tracker">
              <div className={`progress-step ${selectedProduct ? "done" : "active"}`}>
                <span className="ps-num">{selectedProduct ? <CheckIcon /> : "1"}</span>
                <span>Product</span>
              </div>
              <div className="progress-line" />
              <div className={`progress-step ${uploadDone ? "done" : isLoading ? "active" : ""}`}>
                <span className="ps-num">{uploadDone ? <CheckIcon /> : "2"}</span>
                <span>Upload</span>
              </div>
              <div className="progress-line" />
              <div className={`progress-step ${latestFrd ? "done" : checkingFrd ? "active" : ""}`}>
                <span className="ps-num">{latestFrd ? <CheckIcon /> : "3"}</span>
                <span>FRD</span>
              </div>
            </div>
          </div>

          <div className="content-grid">
            {/* Step 1 */}
            <div className="panel">
              <div className="panel-header">
                <div className="panel-step">01</div>
                <div>
                  <h2 className="panel-title">Select Product</h2>
                  <p className="panel-subtitle">Choose the product type for this audit</p>
                </div>
              </div>
              <div className="product-grid">
                {products.map((p) => (
                  <button
                    key={p.name}
                    className={`product-chip ${selectedProduct === p.name ? "selected" : ""}`}
                    style={selectedProduct === p.name ? { "--chip-color": p.color } : {}}
                    onClick={() => {
                      setSelectedProduct(p.name);
                      setMessage("");
                      setUploadDone(false);
                      setLatestFrd(null);
                    }}
                  >
                    <span className="chip-dot" style={{ background: p.color }} />
                    {p.name}
                    {selectedProduct === p.name && (
                      <span className="chip-check"><CheckIcon /></span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2 */}
            <div className="panel">
              <div className="panel-header">
                <div className="panel-step">02</div>
                <div>
                  <h2 className="panel-title">Upload Checklist</h2>
                  <p className="panel-subtitle">Supports .xls and .xlsx Excel files</p>
                </div>
              </div>

              <input
                type="file"
                accept=".xls,.xlsx"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={handleFileChange}
              />

              <div
                className={`drop-zone ${dragOver ? "drag-over" : ""} ${!selectedProduct ? "disabled" : ""}`}
                onClick={openFilePicker}
                onDragOver={(e) => { e.preventDefault(); if (selectedProduct) setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                {isLoading ? (
                  <div className="drop-loading">
                    <div className="ring-spinner" />
                    <span>Processing checklist...</span>
                  </div>
                ) : (
                  <div className="drop-content">
                    <div className="drop-icon-wrap">
                      <FileIcon />
                    </div>
                    <p className="drop-label">
                      {selectedProduct
                        ? <>Drop your Excel file here, or <span className="drop-link">browse</span></>
                        : "Select a product above to enable upload"}
                    </p>
                    <p className="drop-sub">Supported: .xls, .xlsx</p>
                  </div>
                )}
              </div>

              <button
                className={`btn btn-primary ${(!selectedProduct || isLoading) ? "btn-disabled" : ""}`}
                onClick={openFilePicker}
                disabled={!selectedProduct || isLoading}
              >
                {isLoading ? (
                  <><div className="btn-spinner" /> Processing...</>
                ) : (
                  <><UploadIcon /> Upload Checklist</>
                )}
              </button>

              {message && (
                <div className={`alert alert-${messageType}`}>
                  <div className="alert-dot" />
                  {message}
                </div>
              )}
            </div>

            {/* Step 3 */}
            <div className="panel">
              <div className="panel-header">
                <div className="panel-step">03</div>
                <div>
                  <h2 className="panel-title">Download FRD</h2>
                  <p className="panel-subtitle">Your generated Feature Requirements Document</p>
                </div>
              </div>

              {!uploadDone && !checkingFrd && !latestFrd && (
                <div className="frd-empty">
                  <div className="frd-empty-icon"><PDFIcon /></div>
                  <p>Complete steps 1 & 2 to generate your FRD</p>
                </div>
              )}

              {checkingFrd && (
                <div className="frd-generating">
                  <div className="gen-progress">
                    <div className="gen-bar" />
                  </div>
                  <p className="gen-label">Generating FRD document...</p>
                </div>
              )}

              {latestFrd && (
                <div className="frd-ready">
                  <div className="frd-file-card">
                    <div className="frd-file-icon"><PDFIcon /></div>
                    <div className="frd-file-info">
                      <div className="frd-file-name">{latestFrd.filename}</div>
                      <div className="frd-file-meta">PDF · Ready to download</div>
                    </div>
                    <div className="frd-file-status" />
                  </div>
                  <button className="btn btn-success" onClick={handleDownloadFrd}>
                    <DownloadIcon /> Download FRD
                  </button>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
