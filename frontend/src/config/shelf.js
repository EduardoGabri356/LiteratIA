// Só visual: onde fica cada lombada na imagem da estante (1376x768). Valores em % da imagem,
// medidos sobre a arte final. A lombada é identificada pela COR:
//   verde escuro com adornos dourados = Memórias Póstumas | vinho/bordô = O Cortiço | ocre rústico = Vidas Secas
export const SHELF_CONFIG = {
  bgImage: '/assets/scenes/HubEstanteDeLivros.jpeg',
  aspect: '1376 / 768',
  books: [
    { slug: 'memorias-postumas-de-bras-cubas', position: { left: 48.0, top: 38.2, width: 3.9, height: 25 } },
    { slug: 'o-cortico', position: { left: 27.6, top: 65.8, width: 4.4, height: 25.6 } },
    { slug: 'vidas-secas', position: { left: 71.7, top: 11.3, width: 4.5, height: 24.2 } },
  ],
};
