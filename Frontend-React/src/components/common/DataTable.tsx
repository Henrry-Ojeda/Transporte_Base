import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';

export interface ColumnDef<T> {
  header: React.ReactNode;
  accessorKey?: keyof T | string;
  cell?: (row: T) => React.ReactNode;
  className?: string;
  sortable?: boolean;
  width?: string | number;
  minWidth?: string | number;
  style?: React.CSSProperties;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  searchPlaceholder?: string;
  searchFilter?: (row: T, term: string) => boolean;
  isLoading?: boolean;
  emptyMessage?: string;
  actions?: React.ReactNode;
  exportFileName?: string;
  pageSizeDefault?: number;
  isRowExpanded?: (row: T) => boolean;
  renderSubRow?: (row: T) => React.ReactNode;
  footerContent?: (filteredData: T[]) => React.ReactNode;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  searchPlaceholder = 'Buscar...',
  searchFilter,
  isLoading = false,
  emptyMessage = 'No hay registros disponibles',
  actions,
  exportFileName,
  pageSizeDefault = 10,
  isRowExpanded,
  renderSubRow,
  footerContent,
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(pageSizeDefault);

  // Filtrado
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase();

    if (searchFilter) {
      return data.filter((row) => searchFilter(row, term));
    }

    return data.filter((row) =>
      Object.values(row).some((val) =>
        String(val ?? '').toLowerCase().includes(term)
      )
    );
  }, [data, searchTerm, searchFilter]);

  // Ordenamiento
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal === bVal) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const res = aVal > bVal ? 1 : -1;
      return sortDirection === 'asc' ? res : -res;
    });
  }, [filteredData, sortKey, sortDirection]);

  // Paginación
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleSort = (key?: string) => {
    if (!key) return;
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const handleExportExcel = () => {
    if (!sortedData.length) return;
    const ws = XLSX.utils.json_to_sheet(sortedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Datos');
    XLSX.writeFile(wb, `${exportFileName || 'exportacion'}.xlsx`);
  };

  return (
    <div className="content-card datatable-card" style={{ padding: '20px', marginBottom: '24px' }}>
      {/* Barra de Búsqueda y Acciones */}
      <div
        className="datatable-toolbar"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '16px',
        }}
      >
        <div className="datatable-search-box" style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
          <i
            className="fa-solid fa-magnifying-glass"
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#94a3b8',
              fontSize: '13px',
            }}
          ></i>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder={searchPlaceholder}
            className="form-input"
            style={{
              width: '100%',
              paddingLeft: '36px',
              height: '38px',
              fontSize: '13px',
            }}
          />
        </div>

        <div className="datatable-actions-box" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {exportFileName && (
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={sortedData.length === 0}
              className="btn btn-outline"
              style={{
                height: '38px',
                padding: '0 14px',
                fontSize: '12.5px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
              }}
              title="Exportar a Excel"
            >
              <i className="fa-solid fa-file-excel" style={{ color: '#10b981' }}></i>
              Exportar
            </button>
          )}
          {actions}
        </div>
      </div>

      {/* Contenedor Tabla Responsive */}
      <div className="table-responsive" style={{ overflowX: 'auto' }}>
        {isLoading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: '#64748b' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '24px', color: '#4f46e5', marginBottom: '8px' }}></i>
            <p style={{ margin: 0, fontSize: '13.5px' }}>Cargando información...</p>
          </div>
        ) : paginatedData.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: '#94a3b8' }}>
            <i className="fa-regular fa-folder-open" style={{ fontSize: '32px', marginBottom: '8px', display: 'block', opacity: 0.5 }}></i>
            <p style={{ margin: 0, fontWeight: 600, color: '#475569', fontSize: '14px' }}>{emptyMessage}</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>No hay datos que coincidan con los criterios de búsqueda.</p>
          </div>
        ) : (
          <table className="dataTable modern-table data-table" style={{ width: '100%', minWidth: '850px', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {columns.map((col, idx) => (
                  <th
                    key={idx}
                    onClick={() => col.sortable && handleSort(col.accessorKey as string)}
                    className={col.className}
                    style={{
                      cursor: col.sortable ? 'pointer' : 'default',
                      userSelect: 'none',
                      padding: '12px 16px',
                      whiteSpace: 'nowrap',
                      background: '#f8fafc',
                      borderBottom: '2px solid #cbd5e1',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      color: '#475569',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      width: col.width,
                      minWidth: col.minWidth,
                      ...col.style,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>{col.header}</span>
                      {col.sortable && (
                        <i
                          className={`fa-solid ${
                            sortKey === col.accessorKey
                              ? sortDirection === 'asc'
                                ? 'fa-arrow-up-short-wide'
                                : 'fa-arrow-down-wide-short'
                              : 'fa-sort'
                          }`}
                          style={{ fontSize: '11px', opacity: sortKey === col.accessorKey ? 1 : 0.4 }}
                        ></i>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((row, rIdx) => {
                const expanded = isRowExpanded ? isRowExpanded(row) : false;
                return (
                  <React.Fragment key={row._rowKey || row.id || rIdx}>
                    <tr style={{ transition: 'background-color 0.15s', background: expanded ? '#f8fafc' : undefined }}>
                      {columns.map((col, cIdx) => (
                        <td
                          key={cIdx}
                          className={col.className}
                          style={{
                            padding: '13px 16px',
                            borderBottom: '1px solid #f1f5f9',
                            verticalAlign: 'middle',
                            fontSize: '13px',
                            width: col.width,
                            minWidth: col.minWidth,
                            ...col.style,
                          }}
                        >
                          {col.cell
                            ? (() => {
                                try {
                                  return col.cell(row);
                                } catch (e) {
                                  console.error('Error renderizando celda en DataTable:', e);
                                  return null;
                                }
                              })()
                            : col.accessorKey
                            ? String((row && (row as any)[col.accessorKey as string]) ?? '')
                            : null}
                        </td>
                      ))}
                    </tr>
                    {expanded && renderSubRow && (
                      <tr className="dt-child-row">
                        <td colSpan={columns.length} style={{ padding: 0, borderBottom: '2px solid #cbd5e1' }}>
                          {renderSubRow(row)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            {footerContent && (
              <tfoot className="dt-footer-summary" style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontWeight: 700, fontSize: '12.5px' }}>
                {footerContent(sortedData)}
              </tfoot>
            )}
          </table>
        )}
      </div>

      {/* Paginación */}
      {!isLoading && sortedData.length > 0 && (
        <div
          className="datatable-pagination"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '14px',
            marginTop: '10px',
            borderTop: '1px solid #f1f5f9',
            fontSize: '12.5px',
            color: '#64748b',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div className="datatable-pagination-info" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>
              Mostrando {Math.min(sortedData.length, (currentPage - 1) * pageSize + 1)} a{' '}
              {Math.min(sortedData.length, currentPage * pageSize)} de {sortedData.length} registros
            </span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="form-input"
              style={{ height: '30px', padding: '0 8px', fontSize: '12px' }}
            >
              <option value="10">10 por pág.</option>
              <option value="25">25 por pág.</option>
              <option value="50">50 por pág.</option>
              <option value="100">100 por pág.</option>
            </select>
          </div>

          <div className="datatable-pagination-controls" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="btn btn-outline"
              style={{ height: '30px', padding: '0 10px', fontSize: '12px' }}
            >
              <i className="fa-solid fa-chevron-left"></i>
            </button>
            <span style={{ padding: '0 8px', fontWeight: 700, color: '#1e293b' }}>
              Página {currentPage} de {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="btn btn-outline"
              style={{ height: '30px', padding: '0 10px', fontSize: '12px' }}
            >
              <i className="fa-solid fa-chevron-right"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataTable;
