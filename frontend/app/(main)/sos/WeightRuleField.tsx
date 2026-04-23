'use client';
import React, { useState, useEffect } from 'react';
import type { Vendor } from '@/interface/IDatatable';

interface Props {
  vendor: Vendor | null;
  value: string;
  onChange: (v: string) => void;
}

const ruleLabel = (r: string) => r === 'per_pallet' ? 'Per Pallet' : 'Aggregated';
const ruleDesc = (r: string) => r === 'per_pallet'
  ? 'Record each pallet separately'
  : 'One record, total weight + qty';

export function WeightRuleField({ vendor, value, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setExpanded(false); }, [vendor?.id]);

  if (!vendor) {
    return (
      <div style={{
        padding: '12px 14px', border: '1px dashed var(--hair-strong)',
        borderRadius: 3, background: 'var(--surface-2)',
        fontSize: 12, color: 'var(--ink-4)', fontStyle: 'italic',
      }}>
        Select a vendor to inherit its weight rule.
      </div>
    );
  }

  const vendorDefault = vendor.default_weight_rule;
  const effective = value || vendorDefault;
  const isOverride = !!value && value !== vendorDefault;

  return (
    <div style={{ border: '1px solid var(--hair-strong)', borderRadius: 3, background: 'var(--surface)', overflow: 'hidden' }}>
      {/* Summary row */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--ink)' }}>{ruleLabel(effective)}</span>
            {!isOverride && (
              <span style={{ fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                inherited from {vendor.name}
              </span>
            )}
            {isOverride && (
              <span style={{ fontSize: 10.5, color: 'var(--warn)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>
                overrides {vendor.name} default
              </span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{ruleDesc(effective)}</div>
        </div>
        <button type="button" onClick={() => setExpanded(e => !e)} style={{
          background: 'var(--surface-2)', border: '1px solid var(--hair-strong)',
          borderRadius: 3, padding: '5px 10px', fontSize: 11.5, color: 'var(--ink-2)',
          cursor: 'pointer', letterSpacing: '0.04em', fontFamily: 'inherit',
        }}>
          {expanded ? 'Done' : (isOverride ? 'Edit' : 'Change')}
        </button>
      </div>

      {/* Expanded options */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--hair)', background: 'var(--surface-2)', padding: '10px 14px 12px' }}>
          <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 8 }}>
            Override for this SO
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {(['per_pallet', 'aggregated'] as const).map(r => {
              const checked = effective === r;
              const isDefault = vendorDefault === r;
              return (
                <label key={r} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '8px 10px', cursor: 'pointer', borderRadius: 3,
                  background: checked ? 'var(--surface)' : 'transparent',
                  border: '1px solid ' + (checked ? 'var(--hair-strong)' : 'transparent'),
                }}>
                  <span style={{
                    width: 14, height: 14, borderRadius: '50%',
                    border: '1.25px solid ' + (checked ? 'var(--ink)' : 'var(--ink-5)'),
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, marginTop: 1,
                  }}>
                    {checked && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ink)' }} />}
                  </span>
                  <input type="radio" checked={checked}
                    onChange={() => onChange(isDefault ? '' : r)}
                    style={{ display: 'none' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, color: 'var(--ink)' }}>
                      {ruleLabel(r)}
                      {isDefault && (
                        <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--ink-4)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                          {vendor.name} default
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{ruleDesc(r)}</div>
                  </div>
                </label>
              );
            })}
          </div>

          {isOverride && (
            <div style={{
              marginTop: 10, padding: '8px 10px',
              border: '1px solid #e8d4ae', background: '#faf3e4', borderRadius: 3,
              display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a56b1f"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div style={{ fontSize: 11.5, color: '#7a4e12', lineHeight: 1.5 }}>
                Overriding <b style={{ fontWeight: 500 }}>{vendor.name}</b> default. This applies only to this SO.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
