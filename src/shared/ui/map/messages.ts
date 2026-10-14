import type { Locale } from '@/shared/api'

export const mapMessages: Record<Locale, Record<string, string>> = {
  ru: {
    title: 'Вход для самовывоза на карте',
    directions: 'Маршрут в Google Maps',
    loading: 'Загружаем карту…',
    unavailable: 'Карта не загрузилась. Адреса и поиск остаются доступны.',
    tilesUnavailable:
      'Подложка карты недоступна. Точки и список заведений остаются доступны.',
    openMap: 'Открыть карту',
    retry: 'Повторить загрузку карты',
    zoomIn: 'Приблизить карту',
    zoomOut: 'Отдалить карту',
    keyboard:
      'Перемещай карту стрелками. Для изменения масштаба используй кнопки плюс и минус.',
    pickHint:
      'Нажми на карту, чтобы отметить вход для самовывоза. Точку можно уточнить координатами.',
    userLocation: 'Твоя приблизительная позиция',
    dataHint:
      'OpenStreetMap получает область просматриваемой карты и IP-адрес.',
    mapIssue: 'Сообщить об ошибке карты',
  },
  kk: {
    title: 'Картадағы алып кету кіреберісі',
    directions: 'Google Maps бағыты',
    loading: 'Карта жүктелуде…',
    unavailable: 'Карта жүктелмеді. Мекенжайлар мен іздеу қолжетімді.',
    tilesUnavailable:
      'Карта негізі қолжетімсіз. Нүктелер мен мекемелер тізімі қолжетімді.',
    openMap: 'Картаны ашу',
    retry: 'Картаны қайта жүктеу',
    zoomIn: 'Картаны жақындату',
    zoomOut: 'Картаны алыстату',
    keyboard:
      'Картаны көрсеткілермен жылжыт. Масштабты өзгерту үшін плюс және минус батырмаларын қолдан.',
    pickHint:
      'Алып кету кіреберісін белгілеу үшін картаны бас. Нүктені координаттармен нақтылауға болады.',
    userLocation: 'Шамамен тұрған жерің',
    dataHint: 'OpenStreetMap қаралған карта аумағы мен IP-мекенжайды алады.',
    mapIssue: 'Карта қатесін хабарлау',
  },
  en: {
    title: 'Pickup entrance on the map',
    directions: 'Directions in Google Maps',
    loading: 'Loading the map…',
    unavailable:
      'The map could not load. Addresses and search are still available.',
    tilesUnavailable:
      'The map background is unavailable. Venue markers and the list are still available.',
    openMap: 'Open map',
    retry: 'Retry map loading',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    keyboard:
      'Move the map with the arrow keys. Use the plus and minus buttons to zoom.',
    pickHint:
      'Click the map to mark the pickup entrance. You can fine-tune its coordinates.',
    userLocation: 'Your approximate position',
    dataHint: 'OpenStreetMap receives the area you view and your IP address.',
    mapIssue: 'Report a map issue',
  },
}
