/**
 * Índice espacial em grade sobre os SEGMENTOS das geometrias das arestas. Serve para achar, sem
 * varrer o grafo, o ponto da rede mais próximo de uma coordenada.
 *
 * Cada segmento (vértice k até k+1 da mesma aresta) é registrado em todas as células de ~100 m
 * que sua caixa envolvente toca. A busca anda em anéis de células em volta do ponto e para
 * quando o anel seguinte não pode mais conter nada mais perto que o melhor já achado.
 *
 * Tudo em coordenadas planas locais (metros), em typed arrays.
 */

const CELULA_PADRAO_M = 100;
/** Para uma rede enorme, aumenta a célula em vez de criar milhões de células vazias. */
const MAX_CELULAS = 4_000_000;
const EMPATE_M = 1e-9;

export class GradeSegmentos {
  private readonly celula: number;
  private readonly minX: number;
  private readonly minY: number;
  private readonly maxX: number;
  private readonly maxY: number;
  private readonly colunas: number;
  private readonly linhas: number;
  private readonly celulaIni: Int32Array;
  private readonly celulaSeg: Int32Array;

  // Resultado da última busca bem-sucedida (evita alocar um objeto por consulta).
  segmento = -1;
  /** Posição do ponto projetado dentro do segmento, de 0 (vértice k) a 1 (vértice k+1). */
  t = 0;
  distancia = Infinity;
  arestaEncontrada = -1;

  // Estado interno da busca em andamento.
  private px = 0;
  private py = 0;

  /**
   * @param vx x de cada vértice (todas as arestas, em sequência)
   * @param vy y de cada vértice
   * @param arestaDoVertice a aresta a que cada vértice pertence; o segmento k existe se os
   *   vértices k e k+1 são da mesma aresta
   */
  constructor(
    private readonly vx: Float64Array,
    private readonly vy: Float64Array,
    private readonly arestaDoVertice: Int32Array,
  ) {
    const n = vx.length;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = vx[i]!;
      const y = vy[i]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (n === 0) {
      minX = minY = maxX = maxY = 0;
    }
    this.minX = minX;
    this.minY = minY;
    this.maxX = maxX;
    this.maxY = maxY;

    let celula = CELULA_PADRAO_M;
    let colunas = Math.floor((maxX - minX) / celula) + 1;
    let linhas = Math.floor((maxY - minY) / celula) + 1;
    while (colunas * linhas > MAX_CELULAS) {
      celula *= 2;
      colunas = Math.floor((maxX - minX) / celula) + 1;
      linhas = Math.floor((maxY - minY) / celula) + 1;
    }
    this.celula = celula;
    this.colunas = colunas;
    this.linhas = linhas;

    // Duas passadas: contar quantos segmentos cada célula recebe, depois preencher.
    const contagem = new Int32Array(colunas * linhas + 1);
    for (let k = 0; k < n - 1; k++) {
      if (arestaDoVertice[k] !== arestaDoVertice[k + 1]) continue;
      this.percorrerCelulas(k, (c) => {
        contagem[c + 1]!++;
      });
    }
    for (let c = 0; c < colunas * linhas; c++) contagem[c + 1]! += contagem[c]!;
    this.celulaIni = contagem;

    const preenchido = new Int32Array(colunas * linhas);
    this.celulaSeg = new Int32Array(contagem[colunas * linhas]!);
    for (let k = 0; k < n - 1; k++) {
      if (arestaDoVertice[k] !== arestaDoVertice[k + 1]) continue;
      this.percorrerCelulas(k, (c) => {
        this.celulaSeg[this.celulaIni[c]! + preenchido[c]!] = k;
        preenchido[c]!++;
      });
    }
  }

  get bytes(): number {
    return this.celulaIni.byteLength + this.celulaSeg.byteLength;
  }

  private percorrerCelulas(k: number, visitar: (celula: number) => void): void {
    const x0 = Math.min(this.vx[k]!, this.vx[k + 1]!);
    const x1 = Math.max(this.vx[k]!, this.vx[k + 1]!);
    const y0 = Math.min(this.vy[k]!, this.vy[k + 1]!);
    const y1 = Math.max(this.vy[k]!, this.vy[k + 1]!);
    const c0 = Math.floor((x0 - this.minX) / this.celula);
    const c1 = Math.floor((x1 - this.minX) / this.celula);
    const r0 = Math.floor((y0 - this.minY) / this.celula);
    const r1 = Math.floor((y1 - this.minY) / this.celula);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) visitar(r * this.colunas + c);
    }
  }

  /**
   * Procura o segmento mais próximo de (px, py) a até `maxM` metros. Se achar, devolve true e
   * deixa o resultado em `segmento`, `t`, `distancia` e `arestaEncontrada`. Em empate de
   * distância, vence a aresta de menor id (resultado determinístico).
   */
  buscar(px: number, py: number, maxM: number): boolean {
    if (
      px < this.minX - maxM ||
      px > this.maxX + maxM ||
      py < this.minY - maxM ||
      py > this.maxY + maxM
    ) {
      return false;
    }
    this.px = px;
    this.py = py;
    this.segmento = -1;
    this.distancia = Infinity;
    this.arestaEncontrada = -1;

    const cx = Math.floor((px - this.minX) / this.celula);
    const cy = Math.floor((py - this.minY) / this.celula);
    const raioMax = Math.ceil(maxM / this.celula) + 1;

    for (let r = 0; r <= raioMax; r++) {
      // Nenhuma célula do anel r está a menos de (r - 1) células do ponto.
      if ((r - 1) * this.celula > Math.min(this.distancia, maxM)) break;
      if (r === 0) {
        this.visitar(cx, cy);
        continue;
      }
      for (let x = cx - r; x <= cx + r; x++) {
        this.visitar(x, cy - r);
        this.visitar(x, cy + r);
      }
      for (let y = cy - r + 1; y <= cy + r - 1; y++) {
        this.visitar(cx - r, y);
        this.visitar(cx + r, y);
      }
    }
    return this.segmento !== -1 && this.distancia <= maxM;
  }

  private visitar(ix: number, iy: number): void {
    if (ix < 0 || iy < 0 || ix >= this.colunas || iy >= this.linhas) return;
    const c = iy * this.colunas + ix;
    const fim = this.celulaIni[c + 1]!;
    for (let i = this.celulaIni[c]!; i < fim; i++) {
      const k = this.celulaSeg[i]!;
      const ax = this.vx[k]!;
      const ay = this.vy[k]!;
      const bx = this.vx[k + 1]!;
      const by = this.vy[k + 1]!;
      const abx = bx - ax;
      const aby = by - ay;
      const comprimento2 = abx * abx + aby * aby;
      let t = 0;
      if (comprimento2 > 0) {
        t = ((this.px - ax) * abx + (this.py - ay) * aby) / comprimento2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
      }
      const dx = this.px - (ax + t * abx);
      const dy = this.py - (ay + t * aby);
      const d = Math.sqrt(dx * dx + dy * dy);

      const aresta = this.arestaDoVertice[k]!;
      if (
        d < this.distancia - EMPATE_M ||
        (d <= this.distancia + EMPATE_M && aresta < this.arestaEncontrada)
      ) {
        this.distancia = d;
        this.segmento = k;
        this.t = t;
        this.arestaEncontrada = aresta;
      }
    }
  }
}
