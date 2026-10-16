/**
 * Heap binário de mínimo, em typed arrays, para a fila do A*.
 *
 * Inserção preguiçosa: em vez de "diminuir a chave" de um nó que já está na fila, insere-se uma
 * nova entrada; as velhas são descartadas ao sair (quem chama compara o `g` da entrada com o
 * melhor `g` conhecido do nó). Cada entrada guarda a chave (f), o nó e o `g` com que entrou.
 *
 * `extrair` não devolve objeto: deixa o resultado em `noExtraido` e `gExtraido`, para o laço
 * principal não alocar nada.
 */
export class HeapBinario {
  private chaves: Float64Array;
  private nos: Int32Array;
  private gs: Float64Array;
  tamanho = 0;
  noExtraido = -1;
  gExtraido = 0;

  constructor(capacidadeInicial = 1024) {
    this.chaves = new Float64Array(capacidadeInicial);
    this.nos = new Int32Array(capacidadeInicial);
    this.gs = new Float64Array(capacidadeInicial);
  }

  limpar(): void {
    this.tamanho = 0;
  }

  /** A menor chave da fila (só vale com a fila não vazia). */
  get chaveTopo(): number {
    return this.chaves[0]!;
  }

  get bytes(): number {
    return this.chaves.byteLength + this.nos.byteLength + this.gs.byteLength;
  }

  inserir(chave: number, no: number, g: number): void {
    if (this.tamanho === this.chaves.length) this.crescer();
    const { chaves, nos, gs } = this;
    let i = this.tamanho++;
    while (i > 0) {
      const pai = (i - 1) >> 1;
      if (chaves[pai]! <= chave) break;
      chaves[i] = chaves[pai]!;
      nos[i] = nos[pai]!;
      gs[i] = gs[pai]!;
      i = pai;
    }
    chaves[i] = chave;
    nos[i] = no;
    gs[i] = g;
  }

  /** Retira a menor entrada; o nó fica em `noExtraido` e o `g` em `gExtraido`. */
  extrair(): void {
    const { chaves, nos, gs } = this;
    this.noExtraido = nos[0]!;
    this.gExtraido = gs[0]!;

    const n = --this.tamanho;
    if (n === 0) return;
    const chave = chaves[n]!;
    const no = nos[n]!;
    const g = gs[n]!;

    let i = 0;
    for (;;) {
      let filho = 2 * i + 1;
      if (filho >= n) break;
      if (filho + 1 < n && chaves[filho + 1]! < chaves[filho]!) filho++;
      if (chaves[filho]! >= chave) break;
      chaves[i] = chaves[filho]!;
      nos[i] = nos[filho]!;
      gs[i] = gs[filho]!;
      i = filho;
    }
    chaves[i] = chave;
    nos[i] = no;
    gs[i] = g;
  }

  private crescer(): void {
    const capacidade = this.chaves.length * 2;
    const chaves = new Float64Array(capacidade);
    const nos = new Int32Array(capacidade);
    const gs = new Float64Array(capacidade);
    chaves.set(this.chaves);
    nos.set(this.nos);
    gs.set(this.gs);
    this.chaves = chaves;
    this.nos = nos;
    this.gs = gs;
  }
}
