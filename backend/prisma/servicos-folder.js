// Serviços do folder da barbearia (textos e imagens fornecidos pelo cliente).
// As imagens ficam em prisma/assets/servicos e foram recortadas da foto do folder impresso:
// troque pelas fotos originais em boa resolução pelo painel quando puder.
export const FOLDER_CATEGORIES = [
  { name: 'Cabelo', sortOrder: 4 },
  { name: 'Barba e rosto', sortOrder: 5 },
  { name: 'Bem-estar', sortOrder: 6 },
];

export const FOLDER_SERVICES = [
  {
    name: 'Kone hindu',
    category: 'Bem-estar',
    image: 'kone-hindu.jpg',
    durationMin: 30,
    description: 'Técnica milenar que usa calor suave para promover relaxamento, leveza na região auricular e alívio das tensões do dia a dia.',
  },
  {
    name: 'Sobrancelhas',
    category: 'Barba e rosto',
    image: 'sobrancelhas.jpg',
    durationMin: 15,
    description: 'Deixa o olhar mais limpo, combina com o corte de cabelo, corrige falhas e imperfeições e valoriza a linha de expressão.',
  },
  {
    name: 'Barboterapia',
    category: 'Barba e rosto',
    image: 'barboterapia.jpg',
    durationMin: 40,
    description: 'Experiência de cuidado para a barba com vaporizador de ozônio, hidratação profunda e massagem relaxante que renova a pele e os fios.',
  },
  {
    name: 'Camuflagem cabelo e barba',
    category: 'Cabelo',
    image: 'camuflagem.jpg',
    durationMin: 40,
    description: 'Deixa o olhar mais jovial: camufla cerca de 50% dos fios brancos sem alterar os escuros, com resultado bem natural.',
  },
  {
    name: 'Limpeza de pele',
    category: 'Barba e rosto',
    image: 'limpeza-de-pele.jpg',
    durationMin: 50,
    description: 'Previne cravos, espinhas, oleosidade e envelhecimento precoce. Remove células mortas, desobstrui os poros e deixa a pele mais leve, limpa e com aspecto saudável.',
  },
  {
    name: 'Hidratação cabelo e barba',
    category: 'Cabelo',
    image: 'hidratacao.jpg',
    durationMin: 30,
    description: 'Devolve força, maciez e brilho à barba e ao cabelo, deixando os fios mais alinhados e saudáveis.',
  },
  {
    name: 'Selagem',
    category: 'Cabelo',
    image: 'selagem.jpg',
    durationMin: 90,
    description: 'Tecnologia com aminoácidos e proteínas que alinha os fios, reduz o volume e deixa o cabelo disciplinado, hidratado e com movimento natural.',
  },
  {
    name: 'Epilação nariz e orelha',
    category: 'Barba e rosto',
    image: 'epilacao-nariz-orelha.jpg',
    durationMin: 15,
    description: 'Mais conforto e higiene; os pelos demoram cerca de 20 dias para começar a crescer.',
  },
  {
    name: 'Alinhamento capilar',
    category: 'Cabelo',
    image: 'alinhamento-capilar.jpg',
    durationMin: 90,
    description: 'Reduz o volume, disciplina os fios e facilita o dia a dia, deixando o cabelo sempre bem cuidado.',
  },
  {
    name: 'Epilação faixa de barba',
    category: 'Barba e rosto',
    image: 'epilacao-faixa-barba.jpg',
    durationMin: 20,
    description: 'Deixa a linha da barba mais definida e a aparência mais limpa, com média de 20 dias sem pelos na maçã do rosto.',
  },
];
