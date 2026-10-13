/** Erro com código HTTP, tratado pelo error handler em app.ts. */
export class ErroHttp extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const naoEncontrado = (recurso: string) => new ErroHttp(404, `${recurso} não encontrado(a)`);

export const naoImplementado = (funcionalidade: string, versao: string) =>
  new ErroHttp(501, `${funcionalidade} ainda não foi implementado(a). Previsto para a ${versao}.`);
