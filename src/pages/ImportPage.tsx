import { useState } from 'react'
import { mergeImport, parseImportJson, type ImportPreview } from '../lib/importJson'
import { previewProjectBackup } from '../lib/seedBackup'
import { exportDataJson } from '../lib/storage'
import { useData } from '../context/DataContext'
import { PrimaryButton, SecondaryButton } from '../components/Field'

export function ImportPage() {
  const { data, replaceData } = useData()
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loadingBackup, setLoadingBackup] = useState(false)

  const loadProjectBackup = async () => {
    setError(null)
    setDone(false)
    setPreview(null)
    setLoadingBackup(true)
    try {
      const result = await previewProjectBackup(data)
      if ('error' in result && result.error) {
        setError(result.error)
      } else if ('preview' in result) {
        setPreview(result.preview)
      }
    } finally {
      setLoadingBackup(false)
    }
  }

  const onFile = async (file: File) => {
    setError(null)
    setDone(false)
    setPreview(null)
    try {
      const text = await file.text()
      const json = JSON.parse(text) as unknown
      const result = parseImportJson(json, data)
      setPreview(result)
    } catch {
      setError('Não foi possível ler o arquivo. Verifique se é um JSON válido.')
    }
  }

  const confirmImport = () => {
    if (!preview) return
    replaceData(mergeImport(data, preview))
    setDone(true)
    setPreview(null)
  }

  const downloadBackup = () => {
    const blob = new Blob([exportDataJson(data)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `loteamento-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6 text-left">
      <section className="rounded-2xl border border-slate-200 p-4 bg-white">
        <h2 className="text-base font-semibold text-slate-900">Importar JSON</h2>
        <p className="text-sm text-slate-600 mt-2">
          Selecione seu arquivo JSON atual. Os dados existentes{' '}
          <strong>não serão apagados</strong> — os registros importados serão adicionados.
        </p>
        <SecondaryButton
          className="mt-4"
          disabled={loadingBackup}
          onClick={() => void loadProjectBackup()}
        >
          {loadingBackup ? 'Lendo backup…' : 'Usar public/backup_banco.json'}
        </SecondaryButton>
        <p className="text-xs text-slate-500 mt-2">
          Coloque seu arquivo em{' '}
          <code className="bg-slate-100 px-1 rounded">public/backup_banco.json</code>. Na primeira
          abertura (sem dados salvos), o sistema importa sozinho.
        </p>
        <label className="mt-4 flex flex-col items-center justify-center min-h-32 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 cursor-pointer hover:border-teal-500 hover:bg-teal-50/30 transition-colors">
          <span className="text-sm font-medium text-slate-700">Toque para escolher arquivo</span>
          <span className="text-xs text-slate-500 mt-1">.json</span>
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onFile(f)
            }}
          />
        </label>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>

      {preview && (
        <section className="rounded-2xl border border-teal-200 bg-teal-50/40 p-4 space-y-3">
          <h3 className="font-semibold text-slate-900">Prévia da importação</h3>
          <ul className="text-sm text-slate-700 space-y-1">
            <li>Clientes encontrados: {preview.stats.clientCount}</li>
            <li>Terrenos: {preview.stats.lotCount}</li>
            <li>Pagamentos: {preview.stats.paymentCount}</li>
          </ul>

          {preview.duplicateNames.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-950">
              <p className="font-semibold">Possíveis duplicados (mesmo nome já cadastrado):</p>
              <ul className="list-disc ml-5 mt-1">
                {preview.duplicateNames.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs">
                Você pode importar mesmo assim (serão criados novos registros) ou cancelar e
                ajustar o arquivo.
              </p>
            </div>
          )}

          {preview.warnings.length > 0 && (
            <div className="text-xs text-slate-600 space-y-1">
              {preview.warnings.map((w, i) => (
                <p key={i}>• {w}</p>
              ))}
            </div>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-teal-800">
              Ver nomes dos clientes na prévia
            </summary>
            <ul className="mt-2 max-h-40 overflow-y-auto space-y-0.5 text-slate-600">
              {preview.clients.map((c) => (
                <li key={c.id}>{c.name}</li>
              ))}
            </ul>
          </details>

          <div className="flex flex-col gap-2 pt-2">
            <PrimaryButton onClick={confirmImport}>Confirmar importação</PrimaryButton>
            <SecondaryButton onClick={() => setPreview(null)}>Cancelar</SecondaryButton>
          </div>
        </section>
      )}

      {done && (
        <p className="text-sm text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          Importação concluída com sucesso!
        </p>
      )}

      <section className="rounded-2xl border border-slate-200 p-4">
        <h2 className="text-base font-semibold">Backup dos dados atuais</h2>
        <p className="text-sm text-slate-600 mt-2">
          Baixe uma cópia de segurança antes de importar, se preferir.
        </p>
        <SecondaryButton className="mt-3" onClick={downloadBackup}>
          Baixar backup JSON
        </SecondaryButton>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-600 space-y-2">
        <p className="font-semibold text-slate-800">Formatos aceitos (flexível)</p>
        <p>Lista de clientes: <code className="bg-white px-1 rounded">[{`{ "nome", "terrenos": [...] }`}]</code></p>
        <p>Ou objeto: <code className="bg-white px-1 rounded">{`{ "clientes": [...] }`}</code></p>
        <p>
          Cada terreno pode ter: quadra, lote, valor, entrada, dataEntrada, qtdParcelas,
          valorParcela, dataPrimeiraParcela, parcelas[], pagamentos[].
        </p>
      </section>
    </div>
  )
}
