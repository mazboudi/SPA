import React, { useState } from 'react';
import { checkAppStore, checkJamfPackage } from '../../lib/preflightApi';

export default function MacPreflightPanel({ appName }) {
  const [loading, setLoading] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const [appStoreResult, setAppStoreResult] = useState(null);
  const [jamfResult, setJamfResult] = useState(null);
  const [jamfNotConfigured, setJamfNotConfigured] = useState(false);
  const [error, setError] = useState(null);

  const handleCheck = async () => {
    if (!appName) return;
    setLoading(true);
    setError(null);
    setHasChecked(true);
    setAppStoreResult(null);
    setJamfResult(null);
    setJamfNotConfigured(false);

    try {
      // Run both checks in parallel
      const [appStoreData, jamfData] = await Promise.allSettled([
        checkAppStore(appName),
        checkJamfPackage(appName)
      ]);

      if (appStoreData.status === 'fulfilled') {
        setAppStoreResult(appStoreData.value?.results || []);
      } else {
        console.error('App Store check failed:', appStoreData.reason);
      }

      if (jamfData.status === 'fulfilled' && jamfData.value) {
        setJamfResult(jamfData.value?.results || []);
      } else if (jamfData.status === 'rejected') {
        const errorMsg = jamfData.reason.message || '';
        if (errorMsg.includes('501') || errorMsg.includes('not configured')) {
          setJamfNotConfigured(true);
        } else {
          console.error('Jamf check failed:', jamfData.reason);
        }
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mac-preflight-panel" style={{ marginBottom: '24px', padding: '16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>🛫 Check Before Packaging</h3>
        <button className="btn btn-primary btn-sm" onClick={handleCheck} disabled={loading || !appName}>
          {loading ? 'Checking...' : 'Check Availability'}
        </button>
      </div>
      
      {!appName && <p style={{ margin: 0, color: 'var(--color-warning)' }}>⚠️ Please enter a Display Name in the Basic Info step first.</p>}
      {error && <p style={{ margin: 0, color: 'var(--color-error)' }}>❌ Error: {error}</p>}

      {hasChecked && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
          
          {/* App Store Result */}
          <div style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
            <h4 style={{ margin: '0 0 8px 0' }}>🍏 Apple App Store / VPP</h4>
            {appStoreResult && appStoreResult.length > 0 ? (
              <div>
                <p style={{ margin: '0 0 8px 0' }}><strong>Found {appStoreResult.length} match(es) for "{appName}":</strong></p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                  {appStoreResult.map((app) => (
                    <div key={app.trackId} style={{ padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <strong>{app.trackName}</strong> <span style={{ color: 'var(--text-muted)' }}>v{app.version}</span>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>by {app.artistName}</div>
                        </div>
                        <a href={app.trackViewUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', textDecoration: 'underline' }}>View</a>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '8px', background: 'rgba(251, 191, 36, 0.1)', border: '1px solid var(--color-warning)', borderRadius: '4px', color: 'var(--color-warning)' }}>
                  ⚠️ If your target app is in this list, consider deploying via Apple Business Manager (VPP) instead of packaging. VPP apps are automatically updated by Apple.
                </div>
              </div>
            ) : (
              <p style={{ margin: 0, color: 'var(--color-success)' }}>✅ Not found in the App Store (Safe to package)</p>
            )}
          </div>

          {/* Jamf Result */}
          <div style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
            <h4 style={{ margin: '0 0 8px 0' }}>🏢 Jamf Pro Catalog</h4>
            {jamfNotConfigured ? (
              <p style={{ margin: 0, color: 'var(--text-secondary)' }}>⚠️ Jamf integration is not configured. Add JAMF_* variables to the server .env to enable.</p>
            ) : jamfResult && jamfResult.length > 0 ? (
              <div>
                <p style={{ margin: '0 0 4px 0' }}><strong>Found {jamfResult.length} package(s) matching "{appName}":</strong></p>
                <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-secondary)' }}>
                  {jamfResult.map(pkg => (
                    <li key={pkg.id}>{pkg.packageName}</li>
                  ))}
                </ul>
                <p style={{ margin: '8px 0 0 0', fontSize: '0.85rem' }}>
                  If a package for this version already exists, deploy an update only if the content has changed. 
                  Otherwise, this will overwrite the existing package.
                </p>
              </div>
            ) : (
              <p style={{ margin: 0, color: 'var(--color-success)' }}>✅ Safe to publish as new (no matching packages found in Jamf)</p>
            )}
          </div>
          
        </div>
      )}
    </div>
  );
}
