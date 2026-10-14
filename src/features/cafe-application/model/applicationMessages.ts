export const applicationMessages: Record<
  'ru' | 'kk' | 'en',
  Record<string, string>
> = {
  ru: {
    title: 'Данные и проверка заведения',
    intro:
      'Заявка помогает проверить место самовывоза и связаться с ответственным владельцем.',
    pending: 'Заявка отправлена',
    pendingText:
      'Администратор проверяет данные. После одобрения вы сможете публиковать предложения.',
    approved: 'Заведение одобрено',
    approvedText:
      'Вы можете публиковать блюда и наборы. Изменение данных отправит заведение на повторную проверку.',
    rejected: 'Заявка отклонена',
    rejectedText:
      'Прочитайте причины, исправьте данные и отправьте заявку повторно.',
    changes_requested: 'Нужно уточнить данные',
    changes_requestedText:
      'Исправьте замечания администратора и отправьте заявку на новую проверку.',
    suspended: 'Публикация приостановлена',
    suspendedText:
      'Новые предложения и бронирования закрыты. Существующие заказы сохраняются: обработайте их и выдайте еду покупателям по обычным правилам.',
    reviewMessage: 'Сообщение администратора',
    details: 'Данные заявки',
    name: 'Название заведения',
    address: 'Адрес самовывоза',
    description: 'Расскажите о заведении',
    phone: 'Телефон для связи',
    phoneHint: 'Международный формат, например +7 700 000 00 00.',
    submit: 'Сохранить и отправить на проверку',
    saving: 'Отправляем…',
    saved: 'Заявка сохранена и отправлена на проверку.',
    revision: 'Версия',
    updated: 'Обновлена',
    reviewWarning:
      'Любое изменение сохранённых данных требует повторной проверки. Публикация будет закрыта до решения, а текущие заказы останутся доступными.',
    reviewConfirm:
      'Данные точные; я готов связаться с администратором для проверки.',
    refresh: 'Загрузить актуальную заявку',
    retry: 'Повторить',
    conflict:
      'Данные уже изменились. Загрузите актуальную заявку и внесите правки заново.',
    unknown:
      'Подтверждение не получено. Загрузите актуальную заявку, чтобы проверить результат отправки.',
    invalid:
      'Проверьте поля: нужны название, адрес, описание и действующий контактный телефон.',
    generic: 'Не удалось загрузить или сохранить заявку. Проверьте соединение.',
    loading: 'Загружаем заявку…',
    owner: 'Ответственный владелец',
    email: 'Email',
    application: 'Заведение',
  },
  kk: {
    title: 'Мекеме деректері және тексеру',
    intro:
      'Өтінім алып кету орнын тексеруге және жауапты иесімен байланысуға көмектеседі.',
    pending: 'Өтінім жіберілді',
    pendingText:
      'Әкімші деректерді тексеріп жатыр. Мақұлданғаннан кейін ұсыныстарды жариялай аласыз.',
    approved: 'Мекеме мақұлданды',
    approvedText:
      'Тағамдар мен жиынтықтарды жариялай аласыз. Деректерді өзгерту мекемені қайта тексеруге жібереді.',
    rejected: 'Өтінім қабылданбады',
    rejectedText:
      'Себептерді оқып, деректерді түзетіңіз де өтінімді қайта жіберіңіз.',
    changes_requested: 'Деректерді нақтылау қажет',
    changes_requestedText:
      'Әкімшінің ескертулерін түзетіп, өтінімді қайта тексеруге жіберіңіз.',
    suspended: 'Жариялау тоқтатылды',
    suspendedText:
      'Жаңа ұсыныстар мен брондау жабық. Қолданыстағы тапсырыстар сақталады: оларды өңдеп, тағамды әдеттегі ережелермен беріңіз.',
    reviewMessage: 'Әкімшінің хабарламасы',
    details: 'Өтінім деректері',
    name: 'Мекеме атауы',
    address: 'Алып кету мекенжайы',
    description: 'Мекеме туралы айтып беріңіз',
    phone: 'Байланыс телефоны',
    phoneHint: 'Халықаралық формат, мысалы +7 700 000 00 00.',
    submit: 'Сақтау және тексеруге жіберу',
    saving: 'Жіберілуде…',
    saved: 'Өтінім сақталып, тексеруге жіберілді.',
    revision: 'Нұсқа',
    updated: 'Жаңартылды',
    reviewWarning:
      'Сақталған деректерді өзгерту қайта тексеруді қажет етеді. Шешімге дейін жариялау жабық болады, ал қазіргі тапсырыстар қолжетімді қалады.',
    reviewConfirm:
      'Деректер дұрыс; тексеру үшін әкімшімен байланысуға дайынмын.',
    refresh: 'Өзекті өтінімді жүктеу',
    retry: 'Қайталау',
    conflict:
      'Деректер өзгерген. Өзекті өтінімді жүктеп, түзетулерді қайта енгізіңіз.',
    unknown:
      'Растау алынбады. Жіберу нәтижесін тексеру үшін өзекті өтінімді жүктеңіз.',
    invalid:
      'Өрістерді тексеріңіз: атау, мекенжай, сипаттама және дұрыс байланыс телефоны қажет.',
    generic: 'Өтінімді жүктеу не сақтау мүмкін болмады. Байланысты тексеріңіз.',
    loading: 'Өтінім жүктелуде…',
    owner: 'Жауапты иесі',
    email: 'Email',
    application: 'Мекеме',
  },
  en: {
    title: 'Venue information and review',
    intro:
      'Your application helps us verify the pickup location and contact the responsible owner.',
    pending: 'Application submitted',
    pendingText:
      'An administrator is reviewing your information. You can publish offers after approval.',
    approved: 'Venue approved',
    approvedText:
      'You can publish dishes and bags. Updating your venue information sends it for another review.',
    rejected: 'Application rejected',
    rejectedText:
      'Read the reasons, correct your information and submit the application again.',
    changes_requested: 'Information needs changes',
    changes_requestedText:
      'Address the administrator’s comments and send your application for another review.',
    suspended: 'Publishing suspended',
    suspendedText:
      'New offers and bookings are unavailable. Existing orders remain valid: process them and hand over the food under the usual rules.',
    reviewMessage: 'Message from the administrator',
    details: 'Application information',
    name: 'Venue name',
    address: 'Pickup address',
    description: 'Tell us about your venue',
    phone: 'Contact phone',
    phoneHint: 'International format, for example +7 700 000 00 00.',
    submit: 'Save and submit for review',
    saving: 'Submitting…',
    saved: 'Application saved and submitted for review.',
    revision: 'Revision',
    updated: 'Updated',
    reviewWarning:
      'Changing any saved details requires a new review. Publishing will be unavailable until the decision; current orders remain accessible.',
    reviewConfirm:
      'The information is accurate and I can be contacted for verification.',
    refresh: 'Load the latest application',
    retry: 'Retry',
    conflict:
      'This information has changed. Load the latest application and enter your changes again.',
    unknown:
      'Confirmation was not received. Load the latest application to check the submission result.',
    invalid:
      'Check the fields: venue name, address, description and a valid contact phone are required.',
    generic:
      'The application could not be loaded or saved. Check your connection.',
    loading: 'Loading application…',
    owner: 'Responsible owner',
    email: 'Email',
    application: 'Venue',
  },
}
