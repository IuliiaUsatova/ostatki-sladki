import type { Locale } from '@/shared/api'

export const venueMessages: Record<Locale, Record<string, string>> = {
  en: {
    profile: 'Café page',
    profileIntro:
      'Give visitors a clear picture of your café and how to collect their food.',
    about: 'About the café',
    description: 'What makes your place special',
    descriptionHint:
      'Describe your food, your team and the atmosphere. 20–1500 characters.',
    pickup: 'Collecting your order',
    pickupInstructions: 'Pickup instructions',
    pickupHint:
      'Where should a customer go and what should they show? 5–800 characters.',
    locationTitle: 'Pickup point',
    locationHint:
      'Place the pin at the entrance where customers collect their orders. This is optional; check the point before submitting.',
    locationMap: 'Choose the café pickup point on the map',
    locationManual: 'You can enter coordinates even if the map is unavailable.',
    latitude: 'Latitude',
    longitude: 'Longitude',
    coordinateHint:
      'Latitude: −85.05112878 to 85.05112878. Longitude: −180 to 180. Leave both fields empty if you do not want to add a point.',
    locationSelected: 'Pickup point selected.',
    locationNotSet: 'No pickup point selected.',
    locationRemove: 'Remove pickup point',
    invalidLocation:
      'Enter both valid coordinates or leave both empty. Check that latitude is between −85.05112878 and 85.05112878 and longitude is between −180 and 180.',
    languages: 'Content in three languages',
    languageHint:
      'Write both fields in Russian, Kazakh and English. Visitors see their selected language.',
    openingHours: 'Opening hours',
    hoursHint:
      'Use Almaty time. These are café opening hours; each offer has its own pickup window.',
    closed: 'Closed',
    opens: 'Opens',
    closes: 'Closes',
    day0: 'Monday',
    day1: 'Tuesday',
    day2: 'Wednesday',
    day3: 'Thursday',
    day4: 'Friday',
    day5: 'Saturday',
    day6: 'Sunday',
    gallery: 'Café photos',
    galleryHint:
      'Select up to 8 photos. The first one is the cover. Only selected photos are submitted with the page.',
    upload: 'Upload a photo',
    chooseFile: 'Choose a photo',
    uploadHint:
      'JPG, PNG or WebP · up to 6 MB. Use photos you have permission to publish.',
    uploadPrivate:
      'Uploads stay in your private library until attached to an approved café page or a published offer.',
    uploadAction: 'Upload selected photo',
    uploading: 'Uploading…',
    uploadSaved: 'Photo added to your library. Select it below to use it.',
    uploadUncertain:
      'The upload response was lost. Your photo may already be saved. Check the library before uploading again.',
    uploadLibraryRefreshed:
      'The library below is up to date. If the photo is there, select it; retry only if it is missing.',
    uploadLibraryUnavailable:
      'The library could not be refreshed. Check it again before retrying the upload.',
    checkPhotoLibrary: 'Refresh photo library',
    retryMissingPhoto: 'Photo is missing — upload again',
    library: 'Your photo library',
    noPhotos: 'Your library is empty. Start with a photo of your café or food.',
    noGallery: 'No photos selected for the café page.',
    cover: 'Cover',
    selectPhoto: 'Use photo {number}',
    photo: 'Photo {number}',
    remove: 'Remove photo {number} from the page',
    earlier: 'Move photo {number} earlier',
    later: 'Move photo {number} later',
    maxPhotos: 'You can select up to 8 photos.',
    fileSize: '{size} MB',
    fileInvalid: 'Choose a JPG, PNG or WebP photo no larger than 6 MB.',
    emptyFile: 'This file is empty. Choose another photo.',
    libraryLimit:
      'The café photo library limit has been reached. More photos cannot be uploaded right now.',
    photoInvalid:
      'The photo could not be processed. Use a still JPG, PNG or WebP image at least 64 pixels wide and high, and no more than 16 megapixels.',
    uploadRateLimited:
      'Too many upload attempts. Please wait before trying again.',
    uploadUnavailable:
      'Photo upload is temporarily unavailable. Your selected file is still here; try again later.',
    emailRequired:
      'Confirm your email before uploading photos or submitting the café page.',
    loading: 'Loading…',
    retry: 'Try again',
    unavailable: 'We could not complete this request. Please try again.',
    reviewTitle: 'Changes go through review',
    reviewHint:
      'Submitting this page sends the café back to moderation. New sales pause until approval; existing confirmed orders can still be collected.',
    acknowledge:
      'I have checked all three languages, hours, photos and pickup point and want to submit them for review.',
    submit: 'Save and send for review',
    saving: 'Saving…',
    saved: 'Café page saved and sent for review.',
    invalid:
      'Complete both text fields in all three languages and check the hours. Closing time must be after opening time.',
    conflict:
      'The café changed while you were editing. Load its latest revision, review your retained draft and submit again.',
    unknown:
      'The response was lost. Load the latest revision to check what was saved. Your draft will stay here.',
    reloadLatest: 'Load latest revision; keep my draft',
    latestLoaded:
      'Latest revision loaded. Your draft was kept. Check it before submitting again.',
    useSaved: 'Replace draft with saved version',
    preview: 'Page preview',
    draft: 'Unsaved preview',
    noDescription: 'This café has not added a description yet.',
    noHours: 'Opening hours have not been added yet.',
    noPickup:
      'This café has not added general pickup instructions. Follow the pickup window on your offer.',
    publicLink: 'Open café page',
    publicPending: 'The public page is available after the café is approved.',
    address: 'Pickup address',
    availableOffers: 'Food to save here',
    noOffers:
      'No available food right now. Check back for the café’s next offers.',
    pickupDisclaimer:
      'Collect during the pickup window shown on your offer and show your pickup code.',
    galleryOpen: 'Open photo {number} of {total}',
    galleryClose: 'Close gallery',
    previousPhoto: 'Previous photo',
    nextPhoto: 'Next photo',
    galleryCount: '{number} of {total}',
    chooseOfferPhoto: 'Choose the offer photo',
    currentPhoto: 'Current offer photo',
    photoRequired: 'Select or upload a photo for the offer.',
    selected: 'Selected',
    verifyEmail: 'Confirm email',
  },
  ru: {
    profile: 'Страница заведения',
    profileIntro: 'Покажи гостям своё заведение и объясни, как забрать еду.',
    about: 'О заведении',
    description: 'Что особенного в вашем месте',
    descriptionHint: 'Расскажите о еде, команде и атмосфере. 20–1500 символов.',
    pickup: 'Как забрать заказ',
    pickupInstructions: 'Инструкция для самовывоза',
    pickupHint: 'Куда подойти и что показать сотруднику? 5–800 символов.',
    locationTitle: 'Точка самовывоза',
    locationHint:
      'Поставьте отметку у входа, где гости забирают заказы. Точка необязательна; проверьте её перед отправкой.',
    locationMap: 'Выбрать точку самовывоза заведения на карте',
    locationManual: 'Координаты можно ввести, даже если карта недоступна.',
    latitude: 'Широта',
    longitude: 'Долгота',
    coordinateHint:
      'Широта: от −85.05112878 до 85.05112878. Долгота: от −180 до 180. Оставьте оба поля пустыми, если не хотите добавлять точку.',
    locationSelected: 'Точка самовывоза выбрана.',
    locationNotSet: 'Точка самовывоза не выбрана.',
    locationRemove: 'Убрать точку самовывоза',
    invalidLocation:
      'Введите обе корректные координаты или оставьте оба поля пустыми. Широта должна быть от −85.05112878 до 85.05112878, долгота — от −180 до 180.',
    languages: 'Описание на трёх языках',
    languageHint:
      'Заполните оба поля на русском, казахском и английском. Посетитель увидит выбранный им язык.',
    openingHours: 'Часы работы',
    hoursHint:
      'Укажите время Алматы. Это часы работы заведения; у каждого предложения своё окно самовывоза.',
    closed: 'Выходной',
    opens: 'Открытие',
    closes: 'Закрытие',
    day0: 'Понедельник',
    day1: 'Вторник',
    day2: 'Среда',
    day3: 'Четверг',
    day4: 'Пятница',
    day5: 'Суббота',
    day6: 'Воскресенье',
    gallery: 'Фотографии заведения',
    galleryHint:
      'Выберите до 8 фотографий. Первая станет обложкой. На проверку уйдут только выбранные фотографии.',
    upload: 'Загрузить фотографию',
    chooseFile: 'Выбрать фотографию',
    uploadHint:
      'JPG, PNG или WebP · до 6 МБ. Загружайте фотографии, которые разрешено публиковать.',
    uploadPrivate:
      'Загрузки остаются в вашей закрытой библиотеке, пока не прикреплены к одобренной странице заведения или опубликованному предложению.',
    uploadAction: 'Загрузить выбранное фото',
    uploading: 'Загружаем…',
    uploadSaved:
      'Фото добавлено в библиотеку. Выберите его ниже, чтобы использовать.',
    uploadUncertain:
      'Ответ о загрузке потерялся. Фото могло сохраниться. Проверьте библиотеку перед повторной загрузкой.',
    uploadLibraryRefreshed:
      'Библиотека ниже обновлена. Если фото там есть, выберите его; повторяйте загрузку, только если его нет.',
    uploadLibraryUnavailable:
      'Не удалось обновить библиотеку. Проверьте её ещё раз перед повторной загрузкой.',
    checkPhotoLibrary: 'Обновить библиотеку фотографий',
    retryMissingPhoto: 'Фотографии нет — загрузить ещё раз',
    library: 'Ваша библиотека фотографий',
    noPhotos: 'В библиотеке пока пусто. Начните с фото заведения или еды.',
    noGallery: 'Для страницы заведения ещё не выбраны фотографии.',
    cover: 'Обложка',
    selectPhoto: 'Использовать фото {number}',
    photo: 'Фото {number}',
    remove: 'Убрать фото {number} со страницы',
    earlier: 'Переместить фото {number} раньше',
    later: 'Переместить фото {number} позже',
    maxPhotos: 'Можно выбрать до 8 фотографий.',
    fileSize: '{size} МБ',
    fileInvalid: 'Выберите JPG, PNG или WebP размером до 6 МБ.',
    emptyFile: 'Файл пустой. Выберите другую фотографию.',
    libraryLimit:
      'Достигнут лимит библиотеки заведения. Загрузка новых фотографий пока недоступна.',
    photoInvalid:
      'Не удалось обработать фото. Нужен JPG, PNG или WebP без анимации, от 64 пикселей по ширине и высоте, до 16 мегапикселей.',
    uploadRateLimited:
      'Слишком много попыток загрузки. Подождите перед повтором.',
    uploadUnavailable:
      'Загрузка фото временно недоступна. Выбранный файл остался здесь; попробуйте позже.',
    emailRequired:
      'Подтвердите email перед загрузкой фото и отправкой страницы заведения на проверку.',
    loading: 'Загружаем…',
    retry: 'Попробовать снова',
    unavailable: 'Не удалось выполнить запрос. Попробуйте ещё раз.',
    reviewTitle: 'Изменения проходят проверку',
    reviewHint:
      'Сохранение страницы вернёт заведение на модерацию. Новые продажи приостановятся до одобрения; уже подтверждённые заказы можно будет выдать.',
    acknowledge:
      'Я проверила все три языка, часы работы, фотографии и точку самовывоза и хочу отправить их на проверку.',
    submit: 'Сохранить и отправить на проверку',
    saving: 'Сохраняем…',
    saved: 'Страница заведения сохранена и отправлена на проверку.',
    invalid:
      'Заполните оба поля на всех трёх языках и проверьте часы. Закрытие должно быть позже открытия.',
    conflict:
      'Заведение изменилось, пока вы редактировали страницу. Загрузите последнюю версию, проверьте сохранённый черновик и отправьте снова.',
    unknown:
      'Ответ потерялся. Загрузите последнюю версию, чтобы проверить сохранение. Черновик останется здесь.',
    reloadLatest: 'Загрузить последнюю версию, сохранив черновик',
    latestLoaded:
      'Последняя версия загружена. Черновик сохранён. Проверьте его перед повторной отправкой.',
    useSaved: 'Заменить черновик сохранённой версией',
    preview: 'Предпросмотр страницы',
    draft: 'Несохранённый предпросмотр',
    noDescription: 'Заведение пока не добавило описание.',
    noHours: 'Часы работы пока не добавлены.',
    noPickup:
      'Заведение пока не добавило общую инструкцию. Ориентируйся на окно самовывоза в предложении.',
    publicLink: 'Открыть страницу заведения',
    publicPending:
      'Публичная страница станет доступна после одобрения заведения.',
    address: 'Адрес самовывоза',
    availableOffers: 'Что можно спасти здесь',
    noOffers:
      'Сейчас доступной еды нет. Загляни позже за новыми предложениями.',
    pickupDisclaimer:
      'Приходи в окно самовывоза из предложения и покажи код выдачи.',
    galleryOpen: 'Открыть фото {number} из {total}',
    galleryClose: 'Закрыть галерею',
    previousPhoto: 'Предыдущее фото',
    nextPhoto: 'Следующее фото',
    galleryCount: '{number} из {total}',
    chooseOfferPhoto: 'Выбрать фото предложения',
    currentPhoto: 'Текущее фото предложения',
    photoRequired: 'Выберите или загрузите фотографию для предложения.',
    selected: 'Выбрано',
    verifyEmail: 'Подтвердить email',
  },
  kk: {
    profile: 'Мекеме парақшасы',
    profileIntro:
      'Қонақтарға мекемеңді көрсетіп, тағамды қалай алып кетуге болатынын түсіндір.',
    about: 'Мекеме туралы',
    description: 'Мекемеңіздің ерекшелігі',
    descriptionHint:
      'Тағам, команда және атмосфера туралы айтыңыз. 20–1500 таңба.',
    pickup: 'Тапсырысты қалай алу керек',
    pickupInstructions: 'Алып кету нұсқаулығы',
    pickupHint: 'Қай жерге келіп, қызметкерге не көрсету керек? 5–800 таңба.',
    locationTitle: 'Алып кету нүктесі',
    locationHint:
      'Белгіні қонақтар тапсырысты алатын кіреберіске қойыңыз. Нүкте міндетті емес; жіберу алдында тексеріңіз.',
    locationMap: 'Картадан мекеменің алып кету нүктесін таңдау',
    locationManual:
      'Карта қолжетімсіз болса да, координаталарды енгізуге болады.',
    latitude: 'Ендік',
    longitude: 'Бойлық',
    coordinateHint:
      'Ендік: −85.05112878 мен 85.05112878 аралығы. Бойлық: −180 мен 180 аралығы. Нүкте қосқыңыз келмесе, екі өрісті де бос қалдырыңыз.',
    locationSelected: 'Алып кету нүктесі таңдалды.',
    locationNotSet: 'Алып кету нүктесі таңдалмаған.',
    locationRemove: 'Алып кету нүктесін алып тастау',
    invalidLocation:
      'Екі дұрыс координатаны енгізіңіз немесе екі өрісті де бос қалдырыңыз. Ендік −85.05112878 мен 85.05112878, бойлық −180 мен 180 аралығында болуы керек.',
    languages: 'Үш тілдегі сипаттама',
    languageHint:
      'Екі өрісті орыс, қазақ және ағылшын тілдерінде толтырыңыз. Келуші өзі таңдаған тілде көреді.',
    openingHours: 'Жұмыс уақыты',
    hoursHint:
      'Алматы уақытын көрсетіңіз. Бұл мекеменің жұмыс уақыты; әр ұсыныстың өз алып кету аралығы бар.',
    closed: 'Демалыс',
    opens: 'Ашылуы',
    closes: 'Жабылуы',
    day0: 'Дүйсенбі',
    day1: 'Сейсенбі',
    day2: 'Сәрсенбі',
    day3: 'Бейсенбі',
    day4: 'Жұма',
    day5: 'Сенбі',
    day6: 'Жексенбі',
    gallery: 'Мекеме фотолары',
    galleryHint:
      '8 фотоға дейін таңдаңыз. Біріншісі мұқаба болады. Тексеруге тек таңдалған фотолар жіберіледі.',
    upload: 'Фото жүктеу',
    chooseFile: 'Фото таңдау',
    uploadHint:
      'JPG, PNG немесе WebP · 6 МБ дейін. Жариялауға рұқсат етілген фотоларды жүктеңіз.',
    uploadPrivate:
      'Фотолар мақұлданған мекеме парақшасына немесе жарияланған ұсынысқа тіркелгенше жеке кітапханаңызда қалады.',
    uploadAction: 'Таңдалған фотоны жүктеу',
    uploading: 'Жүктеп жатырмыз…',
    uploadSaved: 'Фото кітапханаға қосылды. Қолдану үшін оны төменде таңдаңыз.',
    uploadUncertain:
      'Жүктеу жауабы жоғалды. Фото сақталған болуы мүмкін. Қайта жүктемес бұрын кітапхананы тексеріңіз.',
    uploadLibraryRefreshed:
      'Төмендегі кітапхана жаңартылды. Фото бар болса, оны таңдаңыз; жоқ болса ғана қайта жүктеңіз.',
    uploadLibraryUnavailable:
      'Кітапхананы жаңарту мүмкін болмады. Қайта жүктемес бұрын оны тағы тексеріңіз.',
    checkPhotoLibrary: 'Фото кітапханасын жаңарту',
    retryMissingPhoto: 'Фото жоқ — қайта жүктеу',
    library: 'Фото кітапханаңыз',
    noPhotos: 'Кітапхана әзірге бос. Мекеме немесе тағам фотосынан бастаңыз.',
    noGallery: 'Мекеме парақшасына фото әлі таңдалмаған.',
    cover: 'Мұқаба',
    selectPhoto: '{number}-фотоны қолдану',
    photo: '{number}-фото',
    remove: '{number}-фотоны парақшадан алып тастау',
    earlier: '{number}-фотоны алға жылжыту',
    later: '{number}-фотоны артқа жылжыту',
    maxPhotos: '8 фотоға дейін таңдауға болады.',
    fileSize: '{size} МБ',
    fileInvalid: '6 МБ дейінгі JPG, PNG немесе WebP фотосын таңдаңыз.',
    emptyFile: 'Файл бос. Басқа фото таңдаңыз.',
    libraryLimit:
      'Мекеменің фото кітапханасының шегіне жеттіңіз. Жаңа фото жүктеу әзірге қолжетімсіз.',
    photoInvalid:
      'Фотоны өңдеу мүмкін болмады. Ені мен биіктігі кемінде 64 пиксель, 16 мегапиксельден аспайтын, анимациясыз JPG, PNG немесе WebP қажет.',
    uploadRateLimited:
      'Фото жүктеу әрекеттері тым көп. Қайталаудан бұрын күте тұрыңыз.',
    uploadUnavailable:
      'Фото жүктеу уақытша қолжетімсіз. Таңдалған файл осы жерде сақталды; кейінірек қайта көріңіз.',
    emailRequired:
      'Фото жүктеу және мекеме парақшасын тексеруге жіберу алдында email мекенжайын растаңыз.',
    loading: 'Жүктеп жатырмыз…',
    retry: 'Қайта көру',
    unavailable: 'Сұрауды орындау мүмкін болмады. Қайта көріңіз.',
    reviewTitle: 'Өзгерістер тексеріледі',
    reviewHint:
      'Парақшаны сақтау мекемені қайта тексеруге жібереді. Мақұлданғанша жаңа сатылымдар тоқтайды; расталған тапсырыстарды беруге болады.',
    acknowledge:
      'Үш тілдегі мәтінді, жұмыс уақытын, фотоларды және алып кету нүктесін тексеріп, тексеруге жібергім келеді.',
    submit: 'Сақтап, тексеруге жіберу',
    saving: 'Сақтап жатырмыз…',
    saved: 'Мекеме парақшасы сақталып, тексеруге жіберілді.',
    invalid:
      'Үш тілдегі екі өрісті толтырып, уақытты тексеріңіз. Жабылу уақыты ашылудан кейін болуы керек.',
    conflict:
      'Өңдеу кезінде мекеме өзгерді. Соңғы нұсқаны жүктеп, сақталған жобаңызды тексеріп, қайта жіберіңіз.',
    unknown:
      'Жауап жоғалды. Сақталғанын тексеру үшін соңғы нұсқаны жүктеңіз. Жобаңыз осы жерде қалады.',
    reloadLatest: 'Жобаны сақтап, соңғы нұсқаны жүктеу',
    latestLoaded:
      'Соңғы нұсқа жүктелді. Жобаңыз сақталды. Қайта жіберу алдында тексеріңіз.',
    useSaved: 'Жобаны сақталған нұсқамен ауыстыру',
    preview: 'Парақшаны алдын ала көру',
    draft: 'Сақталмаған алдын ала көрініс',
    noDescription: 'Мекеме сипаттаманы әлі қоспаған.',
    noHours: 'Жұмыс уақыты әлі қосылмаған.',
    noPickup:
      'Мекеме жалпы нұсқаулықты әлі қоспаған. Ұсыныстағы алып кету уақытын басшылыққа ал.',
    publicLink: 'Мекеме парақшасын ашу',
    publicPending:
      'Мекеме мақұлданғаннан кейін қоғамдық парақша қолжетімді болады.',
    address: 'Алып кету мекенжайы',
    availableOffers: 'Мұнда құтқаруға болатын тағам',
    noOffers:
      'Қазір қолжетімді тағам жоқ. Жаңа ұсыныстарды көру үшін кейінірек кір.',
    pickupDisclaimer:
      'Ұсыныстағы алып кету уақытында келіп, тапсырыс кодын көрсет.',
    galleryOpen: '{total} фотоның {number}-фотосын ашу',
    galleryClose: 'Галереяны жабу',
    previousPhoto: 'Алдыңғы фото',
    nextPhoto: 'Келесі фото',
    galleryCount: '{total} фотоның {number}-фотосы',
    chooseOfferPhoto: 'Ұсыныс фотосын таңдау',
    currentPhoto: 'Ұсыныстың қазіргі фотосы',
    photoRequired: 'Ұсынысқа фото таңдаңыз немесе жүктеңіз.',
    selected: 'Таңдалды',
    verifyEmail: 'Email растау',
  },
}
