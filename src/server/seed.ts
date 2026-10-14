import type {
  OfferTranslation,
  Locale,
  Persona,
  User,
  Venue,
  VenueProfileContent,
  PhotoAsset,
} from '../domain/types.ts'

export const SEED_VENUES: Venue[] = [
  {
    id: 'goa-food',
    name: 'Goa Food',
    address: 'Алматы, Достык 42',
    status: 'approved',
    timezone: 'Asia/Almaty',
  },
  {
    id: 'bread-house',
    name: 'Bread House',
    address: 'Алматы, Абая 85',
    status: 'approved',
    timezone: 'Asia/Almaty',
  },
  {
    id: 'new-cafe',
    name: 'New Cafe',
    address: 'Алматы, Сейфуллина 120',
    status: 'pending',
    timezone: 'Asia/Almaty',
  },
]

const dailyHours = (opens: string, closes: string) =>
  Array.from({ length: 7 }, (_, day) => ({ day, closed: false, opens, closes }))
export const SEED_VENUE_PROFILES: Record<string, VenueProfileContent> = {
  'goa-food': {
    translations: {
      ru: {
        description:
          'Кухня Goa Food готовит горячие блюда и пряные гарниры каждый день. Вечером здесь можно забрать блюда из сегодняшнего меню.',
        pickupInstructions:
          'Зайди через главный вход с улицы Достык. Покажи код самовывоза сотруднику у стойки.',
      },
      kk: {
        description:
          'Goa Food асханасы күн сайын ыстық тағамдар мен дәмді гарнирлер дайындайды. Кешке бүгінгі мәзірден тағам алып кетуге болады.',
        pickupInstructions:
          'Достық көшесіндегі негізгі есіктен кір. Алып кету кодын кассадағы қызметкерге көрсет.',
      },
      en: {
        description:
          'Goa Food cooks warm meals and fragrant sides every day. Evening collections offer dishes prepared for today’s menu.',
        pickupInstructions:
          'Enter through the main door on Dostyk Street. Show your collection code to the team at the counter.',
      },
    },
    openingHours: dailyHours('11:00', '21:00'),
    photoIds: [],
  },
  'bread-house': {
    translations: {
      ru: {
        description:
          'Bread House — небольшая пекарня с хлебом, круассанами и сезонной выпечкой. Всё готовится небольшими партиями в течение дня.',
        pickupInstructions:
          'Самовывоз у витрины с выпечкой. Покажи код заказа и возьми с собой сумку для покупок.',
      },
      kk: {
        description:
          'Bread House — нан, круассан және маусымдық тоқаш ұсынатын шағын наубайхана. Өнімдер күні бойы шағын мөлшерде пісіріледі.',
        pickupInstructions:
          'Тапсырысты нан-тоқаш сөресінен алып кет. Тапсырыс кодын көрсетіп, өз сөмкеңді ала кел.',
      },
      en: {
        description:
          'Bread House is a neighbourhood bakery making bread, butter croissants and seasonal pastries in small batches throughout the day.',
        pickupInstructions:
          'Collect at the bakery counter. Show your order code and bring a shopping bag for your pastries.',
      },
    },
    openingHours: dailyHours('08:00', '20:00'),
    photoIds: [],
  },
}

// Static gallery assets belong to the existing fictional fixtures, never to the private upload library.
export const SEED_VENUE_PHOTOS: Record<string, PhotoAsset[]> = {
  'goa-food': [
    {
      id: 'seed-goa-food',
      url: '/images/goa-food.png',
      width: 1024,
      height: 559,
      bytes: 111455,
      createdAt: '2026-10-09T00:00:00.000Z',
    },
    {
      id: 'seed-goa-interior',
      url: '/images/goa-interior.png',
      width: 1024,
      height: 559,
      bytes: 133412,
      createdAt: '2026-10-09T00:00:00.000Z',
    },
  ],
  'bread-house': [
    {
      id: 'seed-bread-house',
      url: '/images/bakery.png',
      width: 1024,
      height: 559,
      bytes: 182501,
      createdAt: '2026-10-09T00:00:00.000Z',
    },
    {
      id: 'seed-bread-croissants',
      url: '/images/croissant.png',
      width: 1376,
      height: 768,
      bytes: 2983738,
      createdAt: '2026-10-09T00:00:00.000Z',
    },
  ],
}

export const SEED_USERS: Record<Persona, User> = {
  buyer: { id: 'alina', name: 'Алина К.', role: 'buyer', venueId: null },
  'buyer-other': {
    id: 'timur',
    name: 'Тимур С.',
    role: 'buyer',
    venueId: null,
  },
  cafe: { id: 'yerlan', name: 'Ерлан', role: 'cafe', venueId: 'goa-food' },
  'cafe-other': {
    id: 'dana',
    name: 'Дана',
    role: 'cafe',
    venueId: 'bread-house',
  },
  pickup: { id: 'aliya', name: 'Алия', role: 'pickup', venueId: 'goa-food' },
  'cafe-pending': {
    id: 'pending-owner',
    name: 'Айжан',
    role: 'cafe',
    venueId: 'new-cafe',
  },
}

export interface SeedOffer {
  id: string
  venueId: string
  kind: 'surprise_bag' | 'specific_item'
  price: number
  originalPrice: number
  totalQuantity: number
  image: string
  pickupStart: string
  pickupEnd: string
  distanceKm: number
  translations: Record<Locale, OfferTranslation>
}

export function seedOffers(now: number): SeedOffer[] {
  const iso = (minutes: number) =>
    new Date(now + minutes * 60_000).toISOString()
  return [
    {
      id: 'goa-surprise',
      venueId: 'goa-food',
      kind: 'surprise_bag',
      price: 2500,
      originalPrice: 5000,
      totalQuantity: 8,
      image: '/images/goa-food.png',
      pickupStart: iso(-5),
      pickupEnd: iso(120),
      distanceKm: 0.8,
      translations: {
        ru: {
          title: 'Набор дня',
          description:
            'Сюрприз-набор свежей еды из сегодняшнего меню Goa Food. Точный состав станет известен при получении.',
          guarantee:
            'Основное блюдо и гарнир на одного человека. Обычная стоимость не менее 5 000 ₸.',
          allergens: ['Молоко', 'Пшеница', 'Возможен контакт с орехами'],
        },
        kk: {
          title: 'Күн жиынтығы',
          description:
            'Goa Food бүгінгі мәзіріндегі жаңа тағамдардан құралған тосын жиынтық. Нақты құрамы алған кезде белгілі болады.',
          guarantee:
            'Бір адамға арналған негізгі тағам мен гарнир. Қалыпты бағасы кемінде 5 000 ₸.',
          allergens: ['Сүт', 'Бидай', 'Жаңғақтармен жанасуы мүмкін'],
        },
        en: {
          title: 'Daily surprise bag',
          description:
            'Fresh food from today’s Goa Food menu. The exact contents are a surprise until pickup.',
          guarantee:
            'One main dish and a side for one person. Regular value of at least ₸5,000.',
          allergens: ['Milk', 'Wheat', 'May have been in contact with nuts'],
        },
      },
    },
    {
      id: 'goa-chicken',
      venueId: 'goa-food',
      kind: 'specific_item',
      price: 1800,
      originalPrice: 3600,
      totalQuantity: 3,
      image: '/images/goa-food.png',
      pickupStart: iso(30),
      pickupEnd: iso(150),
      distanceKm: 0.8,
      translations: {
        ru: {
          title: 'Курица с рисом',
          description:
            'Запечённая курица, рис, томаты, йогуртовый соус и специи. Приготовлено сегодня.',
          guarantee: 'Порция 350 г. Состав известен заранее.',
          allergens: ['Молоко'],
        },
        kk: {
          title: 'Күріш қосылған тауық',
          description:
            'Пеште пісірілген тауық, күріш, қызанақ, йогурт тұздығы және дәмдеуіштер. Бүгін дайындалған.',
          guarantee: '350 г порция. Құрамы алдын ала белгілі.',
          allergens: ['Сүт'],
        },
        en: {
          title: 'Chicken with rice',
          description:
            'Roast chicken, rice, tomatoes, yogurt sauce and spices. Prepared today.',
          guarantee: 'A 350 g portion with a clearly listed recipe.',
          allergens: ['Milk'],
        },
      },
    },
    {
      id: 'bakery-croissants',
      venueId: 'bread-house',
      kind: 'specific_item',
      price: 2000,
      originalPrice: 4000,
      totalQuantity: 5,
      image: '/images/croissant.png',
      pickupStart: iso(10),
      pickupEnd: iso(180),
      distanceKm: 1.6,
      translations: {
        ru: {
          title: 'Круассаны — 4 штуки',
          description:
            'Четыре классических круассана с маслом из сегодняшней выпечки Bread House.',
          guarantee: '4 круассана без начинки, общий вес около 280 г.',
          allergens: ['Пшеница', 'Молоко', 'Яйца'],
        },
        kk: {
          title: 'Круассан — 4 дана',
          description:
            'Bread House бүгін пісірген сары май қосылған төрт классикалық круассан.',
          guarantee: 'Салмасыз 4 круассан, жалпы салмағы шамамен 280 г.',
          allergens: ['Бидай', 'Сүт', 'Жұмыртқа'],
        },
        en: {
          title: 'Four butter croissants',
          description:
            'Four classic butter croissants from today’s Bread House bake.',
          guarantee: '4 plain croissants, approximately 280 g in total.',
          allergens: ['Wheat', 'Milk', 'Eggs'],
        },
      },
    },
    {
      id: 'bakery-surprise',
      venueId: 'bread-house',
      kind: 'surprise_bag',
      price: 1500,
      originalPrice: 3500,
      totalQuantity: 4,
      image: '/images/bakery.png',
      pickupStart: iso(20),
      pickupEnd: iso(180),
      distanceKm: 1.6,
      translations: {
        ru: {
          title: 'Вечерняя выпечка',
          description:
            'Сюрприз-набор хлеба и выпечки из сегодняшней партии. Подходит для уютного завтрака на двоих.',
          guarantee:
            'Не менее 3 изделий. Обычная стоимость не менее 3 500 ₸. Состав меняется.',
          allergens: [
            'Пшеница',
            'Молоко',
            'Яйца',
            'Возможен контакт с орехами',
          ],
        },
        kk: {
          title: 'Кешкі нан-тоқаш жиынтығы',
          description:
            'Бүгінгі нан мен тоқаштан құралған тосын жиынтық. Екі адамға арналған таңғы асқа жарайды.',
          guarantee:
            'Кемінде 3 өнім. Қалыпты бағасы кемінде 3 500 ₸. Құрамы өзгеріп отырады.',
          allergens: [
            'Бидай',
            'Сүт',
            'Жұмыртқа',
            'Жаңғақтармен жанасуы мүмкін',
          ],
        },
        en: {
          title: 'Evening bakery bag',
          description:
            'A surprise selection of bread and pastries baked today. Enough for a cosy breakfast for two.',
          guarantee:
            'At least 3 items, with a regular value of at least ₸3,500. Contents vary.',
          allergens: [
            'Wheat',
            'Milk',
            'Eggs',
            'May have been in contact with nuts',
          ],
        },
      },
    },
  ]
}
