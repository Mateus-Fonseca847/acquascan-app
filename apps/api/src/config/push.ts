/**
 * Prazos dos recibos (receipts) do Expo Push Service.
 * Fonte: docs.expo.dev, "Send notifications with the Expo Push Service", seção "Push receipts".
 */

/**
 * Quando consultar o recibo de um ticket. A documentação do Expo recomenda checar "15 minutes
 * after sending your push notifications". Antes disso o recibo costuma não existir ainda.
 */
export const ESPERA_RECIBO_MS = 15 * 60_000;

/**
 * Por quanto tempo o Expo guarda os recibos. A documentação diz que eles são "cleared after
 * 24 hours". Um ticket mais velho que isso nunca mais terá recibo, então é descartado.
 */
export const RETENCAO_RECIBO_MS = 24 * 3_600_000;

/**
 * Máximo de ids de ticket por consulta de recibos. A documentação trata mais de 1000 como
 * erro (PUSH_TOO_MANY_RECEIPTS).
 */
export const MAX_IDS_POR_CONSULTA = 1000;
