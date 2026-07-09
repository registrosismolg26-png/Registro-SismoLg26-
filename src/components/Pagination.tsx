"use client";

// ── Paginación reutilizable (del lado del cliente) ──────────────────────────
// Pagina una lista YA cargada y filtrada (no pide "páginas" al servidor), para que
// búsqueda + filtros + paginación sigan funcionando 100% offline sobre todo el censo.
// El padre mantiene `page` y `pageSize`; este componente solo muestra el rango, el
// selector de tamaño (10/20/50/100) y la navegación. Todo pill (misma altura --ctl-h).

import StyledSelect from "@/components/StyledSelect";

interface Props {
  total: number;                       // total de ítems (ya filtrados)
  page: number;                        // página actual (1-based)
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;                  // "registros", "consultas"…
}

export default function Pagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  itemLabel = "registros",
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (clampedPage - 1) * pageSize + 1;
  const to = Math.min(clampedPage * pageSize, total);
  const go = (p: number) => onPageChange(Math.min(Math.max(1, p), totalPages));

  return (
    <div className="pager">
      <div className="pager__info">
        {total === 0 ? "Sin resultados" : <>Mostrando <b>{from}–{to}</b> de <b>{total}</b> {itemLabel}</>}
      </div>
      <div className="pager__controls">
        <label className="pager__size">
          <span>Por página</span>
          <span className="pager__size-select">
            <StyledSelect
              value={String(pageSize)}
              onChange={(v) => onPageSizeChange(Number(v))}
              options={pageSizeOptions.map((n) => ({ value: String(n), label: String(n) }))}
              ariaLabel="Filas por página"
            />
          </span>
        </label>
        <div className="pager__nav">
          <button type="button" className="pager__btn" onClick={() => go(clampedPage - 1)} disabled={clampedPage <= 1} aria-label="Página anterior" title="Anterior">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <span className="pager__page">Pág. {clampedPage} / {totalPages}</span>
          <button type="button" className="pager__btn" onClick={() => go(clampedPage + 1)} disabled={clampedPage >= totalPages} aria-label="Página siguiente" title="Siguiente">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
