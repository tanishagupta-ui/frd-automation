import React, { useRef, useState, useEffect } from "react";
import "./App.css";
import axios from "axios";

// --- SVG Icons ---
const IconBox = ({ children, size = 20, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'all 0.3s' }}>
    {children}
  </svg>
);

const LayersIcon = () => <IconBox><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></IconBox>;
const PlusIcon = () => <IconBox><path d="M12 5v14M5 12h14" /></IconBox>;
const HistoryIcon = () => <IconBox><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></IconBox>;
const FileTextIcon = () => <IconBox><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></IconBox>;
const DownloadIcon = () => <IconBox><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></IconBox>;
const CheckCircleIcon = () => <IconBox color="var(--success)"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></IconBox>;
const AlertCircleIcon = () => <IconBox color="var(--error)"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></IconBox>;
const InfoIcon = () => <IconBox color="var(--accent)"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></IconBox>;

function App() {
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [latestFrd, setLatestFrd] = useState(null);
  const [checkingFrd, setCheckingFrd] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('fra-theme') || 'dark');
  const fileInputRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('fra-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const products = [
    { name: "Standard Checkout", cat: "PYMT" },
    { name: "Subscriptions", cat: "RECR" },
    { name: "QR Code", cat: "OFFL" },
    { name: "Affordability", cat: "WIDG" },
    { name: "Smart Collect", cat: "AUTO" },
    { name: "Route", cat: "MKPL" },
    { name: "Payment Links", cat: "LINK" },
    { name: "NCApps", cat: "CORE" },
    { name: "Charge at Will", cat: "TKNZ" },
  ];

  const handleFileUpload = async (file) => {
    if (!file || !selectedProduct) return;

    if (!file.name.match(/\.(xls|xlsx)$/i)) {
      showToast("Please upload a valid Excel file (.xls, .xlsx)", "error");
      return;
    }

    const formData = new FormData();
    formData.append("product", selectedProduct);
    formData.append("checklist", file);

    setIsLoading(true);
    setUploadDone(false);
    setLatestFrd(null);
    showToast("Initializing Deep Scan...", "info");

    try {
      const BASE_URL = "http://localhost:5001";
      await axios.post(`${BASE_URL}/upload`, formData);
      showToast("Data Ingested. Generating Documentation...", "success");
      setUploadDone(true);
      startPolling();
    } catch (err) {
      showToast(err.response?.data?.message || "Ingestion failed.", "error");
      setIsLoading(false);
    }
  };

  const startPolling = () => {
    setCheckingFrd(true);
    const BASE_URL = "http://localhost:5001";
    let count = 0;

    const check = async () => {
      try {
        const res = await axios.get(`${BASE_URL}/api/latest-frd`);
        if (res.data?.filename) {
          setLatestFrd(res.data);
          setCheckingFrd(false);
          setIsLoading(false);
          return;
        }
      } catch (e) { }

      count++;
      if (count < 15) setTimeout(check, 2500);
      else {
        setCheckingFrd(false);
        setIsLoading(false);
        showToast("Documentation takes longer than expected. Check history later.", "info");
      }
    };
    setTimeout(check, 2000);
  };

  const showToast = (msg, type) => {
    setMessage(msg);
    setMessageType(type);
  };

  const downloadPDF = async () => {
    if (!latestFrd) return;
    const BASE_URL = "http://localhost:5001";

    try {
      // Improved robust download method using axios
      const response = await axios({
        url: `${BASE_URL}${latestFrd.url}`,
        method: 'GET',
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', latestFrd.filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
      // Fallback to direct link if blob method fails
      window.open(`${BASE_URL}${latestFrd.url}`, '_blank');
    }
  };

  return (
    <div className="app-root" data-theme={theme}>
      <div className="bg-mesh" />
      <div className="bg-grid" />

      <div className="layout">
        {/* Navigation Sidebar */}
        <aside className="sidebar">
          <div className="logo-container">
            <div className="logo-glow">
              <LayersIcon />
            </div>
          </div>
          <nav className="sidebar-nav">
            <button className="nav-tool active" title="New Audit"><PlusIcon /></button>
            <button className="nav-tool" title="Audit History"><HistoryIcon /></button>
          </nav>
          <div className="sidebar-actions">
            <button className="theme-btn" onClick={toggleTheme}>
              {theme === 'dark' ? "☀️" : "🌙"}
            </button>
            <div style={{ padding: '8px', opacity: 0.5, fontSize: '12px' }}>v2.0</div>
          </div>
        </aside>

        {/* Product Explorer */}
        <section className="nav-panel">
          <header className="panel-header">
            <h2>FRD Automation</h2>
            <p>Select product module</p>
          </header>
          <div className="product-scroll">
            {products.map((p) => (
              <div
                key={p.name}
                className={`module-card ${selectedProduct === p.name ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedProduct(p.name);
                  setUploadDone(false);
                  setLatestFrd(null);
                }}
              >
                <div className="module-info">
                  <span className="module-name">{p.name}</span>
                  <span className="module-tag">{p.cat}</span>
                </div>
                {selectedProduct === p.name && <div className="selected-indicator" />}
              </div>
            ))}
          </div>
        </section>

        {/* Workspace */}
        <main className="workspace">
          <header className="workspace-header">
            <div className="header-meta">
              <span className="path-hint">Workspace / Ingestion / {selectedProduct || 'Idle'}</span>
              <h1>{selectedProduct ? `${selectedProduct} Audit` : "System Ready"}</h1>
            </div>
            <div className="header-actions">
              <div className={`live-pill ${uploadDone ? 'active' : ''}`}>
                <div className="pulse-dot" />
                <span>{isLoading ? 'Processing' : uploadDone ? 'Task Complete' : 'Await Data'}</span>
              </div>
            </div>
          </header>

          <div className="workspace-body">
            <div className="workspace-main">
              <div className="glass-card" style={{ height: '100%' }}>
                <span className="card-label">01 // Data Acquisition</span>
                <div
                  className={`upload-zone ${!selectedProduct ? 'disabled' : ''} ${dragOver ? 'drag-over' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); selectedProduct && setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileUpload(e.dataTransfer.files[0]); }}
                  onClick={() => selectedProduct && fileInputRef.current.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept=".xls,.xlsx"
                    onChange={(e) => handleFileUpload(e.target.files[0])}
                  />

                  {isLoading ? (
                    <div className="processing-state">
                      <div className="scanning-container">
                        <div className="scan-bar" />
                        <div className="data-stream">
                          {`> EXTRACTING_METADATA\n> ANALYZING_ITEM_STATUS\n> MAPPING_CANONICAL_SCHEMA\n> TRIGGERING_GEMINI_AI\n> SCRIBING_FRD_STRUCTURE`}
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <h3 className="accent-text">Scanning Spreadsheet</h3>
                        <p>Mapping identified requirements to FRD structure...</p>
                      </div>
                    </div>
                  ) : (
                    <div className="upload-content">
                      <div className="upload-icon-anim">
                        <FileTextIcon />
                      </div>
                      <h3>{selectedProduct ? 'Drop Audit Spreadsheet' : 'Select Product First'}</h3>
                      <p>Release .xlsx file here or <span className="accent-text">browse assets</span></p>
                    </div>
                  )}
                </div>

                {message && (
                  <div className={`status-toast ${messageType}`}>
                    {messageType === 'success' ? <CheckCircleIcon /> : messageType === 'error' ? <AlertCircleIcon /> : "📡"}
                    <span>{message}</span>
                  </div>
                )}
              </div>
            </div>

            <aside className="workspace-side">
              <div className="glass-card output-card">
                <span className="card-label">02 // Documentation Hub</span>

                <div className="doc-status-panel">
                  {!isLoading && !latestFrd && !checkingFrd && (
                    <div className="empty-output">
                      <div style={{ fontSize: '48px', opacity: 0.2 }}>📄</div>
                      <p>Outputs will appear here after data ingestion</p>
                    </div>
                  )}

                  {(isLoading || checkingFrd) && !latestFrd && (
                    <div className="empty-output">
                      <div className="spinner-glow" />
                      <p>Scribing functional requirements...</p>
                    </div>
                  )}

                  {latestFrd && (
                    <div className="doc-ready-view">
                      <div className="frd-ticket">
                        <div className="ticket-header">
                          <span className="ticket-id">PROCESSED_OK</span>
                          <span style={{ fontSize: '18px' }}>✅</span>
                        </div>
                        <span className="ticket-name">{latestFrd.filename}</span>
                        <div className="ticket-meta">
                          <span>FORMAT: PDF</span> • <span>ENV: PRODUCTION</span>
                        </div>
                      </div>

                      <button className="premium-btn" onClick={downloadPDF}>
                        <DownloadIcon />
                        Download PDF Document
                      </button>

                      <div className="doc-info-panel">
                        <div className="info-row">
                          <span className="info-label">Process Status</span>
                          <span className="info-value success">Ready for Review</span>
                        </div>
                        <div className="info-row">
                          <span className="info-label">Document Type</span>
                          <span className="info-value">PDF Report</span>
                        </div>
                      </div>

                      <div className="action-hint">
                        <div style={{ marginTop: '2px' }}><InfoIcon /></div>
                        <span>Hope this helps! Please take a moment to review the generated document.</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
