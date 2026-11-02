export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-4 py-16">
      <p className="text-brand-600 text-sm font-semibold tracking-wide uppercase">
        Etapa 0.1 · Fundação
      </p>
      <h1 className="text-brand-800 text-3xl font-bold sm:text-4xl">
        VG Rural
      </h1>
      <p className="text-lg text-slate-700">
        Gestão de holdings rurais, fazendas, documentos e financeiro.
      </p>
      <p className="bg-brand-50 rounded-lg p-4 text-sm text-slate-700">
        Ambiente de desenvolvimento. Ainda não há login, banco de dados nem
        armazenamento de documentos.
      </p>
    </main>
  );
}
