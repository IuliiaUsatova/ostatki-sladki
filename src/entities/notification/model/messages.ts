import type { Locale } from '@/shared/api'

export const notificationMessages: Record<Locale, Record<string, string>> = {
  en: {
    title: 'Updates',
    intro: 'Bookings, collections and pickup reminders, all in one place.',
    unreadCount: '{count} unread',
    unreadBadge: 'Unread',
    readBadge: 'Read',
    all: 'All updates',
    unread: 'Unread',
    markRead: 'Mark as read',
    markAllRead: 'Mark all as read',
    markedAll: 'Existing updates marked as read.',
    emptyTitle: 'You’re all caught up',
    emptyAll:
      'Booking and pickup updates will appear here when something happens.',
    emptyUnread: 'There are no unread updates.',
    loading: 'Loading…',
    working: 'Please wait…',
    refresh: 'Refresh updates',
    loadMore: 'Load earlier updates',
    retry: 'Try again',
    openOrder: 'Open order',
    openMerchant: 'Open booking in café workspace',
    orderNumber: 'Order {number}',
    quantity: 'Quantity: {count}',
    pickupWindow: 'Pickup',
    address: 'Pickup address',
    loginNeeded: 'Sign in to see your updates',
    loginHint: 'These messages belong to your account. Sign in to read them.',
    signIn: 'Sign in',
    preferences: 'Email updates',
    preferencesIntro:
      'Choose whether order updates should also arrive by email. Messages stay available here either way.',
    emailEnabled: 'Send booking and pickup updates by email',
    emailLocale: 'Email language',
    localeHint:
      'New email updates will use this language; your interface language stays the same.',
    emailRoleHint:
      'Order emails are available to buyers and café owners. Your in-app messages remain available.',
    verifiedNeeded:
      'Confirm your email before enabling email updates. You can always turn them off.',
    verifyEmail: 'Confirm email',
    savePreferences: 'Save email preferences',
    preferencesSaved: 'Email preferences saved.',
    preferencesUnknown:
      'The response was lost. Reload saved preferences before making another change.',
    reloadPreferences: 'Reload saved preferences',
    preferencesDeliveryHint:
      'Turning email off prevents future submissions. Messages already accepted by the email service cannot be recalled.',
    acceptedHint:
      'Acceptance by the email service does not confirm that a message reached your inbox.',
    'email.pending': 'Email waiting to be sent',
    'email.processing': 'Email being submitted',
    'email.accepted': 'Accepted by email service',
    'email.failed': 'Email submission failed',
    'email.skipped': 'Email not submitted',
    'kind.order_confirmed': 'Your food is booked',
    'kind.order_cancelled': 'Your booking was cancelled',
    'kind.order_collected': 'Your order was collected',
    'kind.pickup_reminder': 'Pickup reminder',
    'kind.booking_confirmed': 'A new booking is confirmed',
    'kind.booking_cancelled': 'A booking was cancelled',
    'kind.booking_collected': 'A booking was collected',
    'kind.order_not_collected': 'The pickup window has ended',
    'kind.booking_not_collected': 'A booking was not collected',
    'cancellation.cafe': 'Cancelled by the café',
    'cancellation.buyer': 'Cancelled by the buyer',
    'reason.unavailable': 'Food is no longer available',
    'reason.closed': 'The café cannot open for pickup',
    'reason.quality_issue':
      'The food does not meet the café’s quality requirements',
    'reason.other': 'Another reason; see the order for details',
    'body.order_confirmed':
      'The café has your booking. Collect within the pickup window and pay at pickup.',
    'body.order_cancelled':
      'This booking is closed. Its previous pickup instructions no longer apply.',
    'body.order_collected':
      'The café confirmed handoff. Thanks for giving good food another chance.',
    'body.pickup_reminder':
      'Check the pickup window below and collect within it. Your pickup code is available in the order.',
    'body.booking_confirmed':
      'Prepare the booked food for the pickup window. Confirm handoff only after checking the customer’s code.',
    'body.booking_cancelled':
      'This booking is closed. Check current availability in your workspace.',
    'body.booking_collected': 'Handoff has been recorded for this booking.',
    'body.order_not_collected':
      'Collection was not recorded before the pickup window ended. The code can no longer be used. If there was a problem, contact the café from the order.',
    'body.booking_not_collected':
      'The pickup window ended without a recorded handoff. This booking is closed; its food is not automatically returned to sale.',
  },
  ru: {
    title: 'Уведомления',
    intro: 'Брони, выдача и напоминания о самовывозе в одном месте.',
    unreadCount: 'Непрочитано: {count}',
    unreadBadge: 'Не прочитано',
    readBadge: 'Прочитано',
    all: 'Все уведомления',
    unread: 'Непрочитанные',
    markRead: 'Отметить прочитанным',
    markAllRead: 'Прочитать все',
    markedAll: 'Существующие уведомления отмечены прочитанными.',
    emptyTitle: 'Всё прочитано',
    emptyAll: 'Здесь появятся сообщения о бронях, выдаче и самовывозе.',
    emptyUnread: 'Непрочитанных уведомлений нет.',
    loading: 'Загружаем…',
    working: 'Подожди…',
    refresh: 'Обновить уведомления',
    loadMore: 'Загрузить предыдущие уведомления',
    retry: 'Попробовать снова',
    openOrder: 'Открыть заказ',
    openMerchant: 'Открыть бронь в кабинете заведения',
    orderNumber: 'Заказ {number}',
    quantity: 'Количество: {count}',
    pickupWindow: 'Самовывоз',
    address: 'Адрес самовывоза',
    loginNeeded: 'Войди, чтобы увидеть уведомления',
    loginHint:
      'Эти сообщения относятся к твоему аккаунту. Войди, чтобы прочитать их.',
    signIn: 'Войти',
    preferences: 'Уведомления по email',
    preferencesIntro:
      'Выбери, отправлять ли сообщения о заказах ещё и на email. Здесь они сохранятся в любом случае.',
    emailEnabled: 'Отправлять письма о бронях и самовывозе',
    emailLocale: 'Язык писем',
    localeHint:
      'Новые письма придут на выбранном языке. Язык интерфейса не изменится.',
    emailRoleHint:
      'Письма о заказах доступны покупателям и владельцам кафе. Уведомления в приложении остаются доступными.',
    verifiedNeeded:
      'Подтверди email перед включением писем. Отключить их можно в любой момент.',
    verifyEmail: 'Подтвердить email',
    savePreferences: 'Сохранить настройки писем',
    preferencesSaved: 'Настройки писем сохранены.',
    preferencesUnknown:
      'Ответ потерялся. Загрузи сохранённые настройки перед следующим изменением.',
    reloadPreferences: 'Загрузить сохранённые настройки',
    preferencesDeliveryHint:
      'Отключение остановит будущую отправку. Письма, уже принятые почтовым сервисом, отозвать нельзя.',
    acceptedHint:
      'Приём письма почтовым сервисом не подтверждает доставку во входящие.',
    'email.pending': 'Письмо ожидает отправки',
    'email.processing': 'Письмо отправляется в сервис',
    'email.accepted': 'Принято почтовым сервисом',
    'email.failed': 'Не удалось отправить письмо',
    'email.skipped': 'Письмо не отправлено',
    'kind.order_confirmed': 'Еда забронирована',
    'kind.order_cancelled': 'Твоя бронь отменена',
    'kind.order_collected': 'Заказ получен',
    'kind.pickup_reminder': 'Напоминание о самовывозе',
    'kind.booking_confirmed': 'Подтверждена новая бронь',
    'kind.booking_cancelled': 'Бронь отменена',
    'kind.booking_collected': 'Бронь выдана',
    'kind.order_not_collected': 'Окно самовывоза закончилось',
    'kind.booking_not_collected': 'Бронь не получена',
    'cancellation.cafe': 'Отменено заведением',
    'cancellation.buyer': 'Отменено покупателем',
    'reason.unavailable': 'Еды больше нет в наличии',
    'reason.closed': 'Заведение не может открыться для самовывоза',
    'reason.quality_issue':
      'Еда не соответствует требованиям качества заведения',
    'reason.other': 'Другая причина; подробности в заказе',
    'body.order_confirmed':
      'Заведение получило бронь. Забери еду в указанное окно и оплати при получении.',
    'body.order_cancelled':
      'Эта бронь закрыта. Прежняя инструкция для самовывоза больше не действует.',
    'body.order_collected':
      'Заведение подтвердило выдачу. Спасибо, что дала хорошей еде второй шанс.',
    'body.pickup_reminder':
      'Проверь окно самовывоза ниже и забери еду до его окончания. Код выдачи найдёшь в заказе.',
    'body.booking_confirmed':
      'Подготовьте еду к окну самовывоза. Подтверждайте выдачу только после проверки кода покупателя.',
    'body.booking_cancelled':
      'Эта бронь закрыта. Проверьте актуальное наличие в кабинете.',
    'body.booking_collected': 'Передача заказа по этой брони зафиксирована.',
    'body.order_not_collected':
      'Выдача не была зафиксирована до конца окна самовывоза. Код больше не действует. Если возникла проблема, напиши заведению из заказа.',
    'body.booking_not_collected':
      'Окно самовывоза закончилось без зафиксированной выдачи. Бронь закрыта; её порции не возвращаются в продажу автоматически.',
  },
  kk: {
    title: 'Хабарламалар',
    intro: 'Тапсырыстар, беру және алып кету еске салғыштары бір жерде.',
    unreadCount: 'Оқылмаған: {count}',
    unreadBadge: 'Оқылмаған',
    readBadge: 'Оқылған',
    all: 'Барлық хабарламалар',
    unread: 'Оқылмаған',
    markRead: 'Оқылды деп белгілеу',
    markAllRead: 'Барлығын оқылды деп белгілеу',
    markedAll: 'Қазіргі хабарламалар оқылды деп белгіленді.',
    emptyTitle: 'Барлығы оқылған',
    emptyAll:
      'Мұнда тапсырыс, беру және алып кету туралы хабарламалар пайда болады.',
    emptyUnread: 'Оқылмаған хабарламалар жоқ.',
    loading: 'Жүктеп жатырмыз…',
    working: 'Күте тұр…',
    refresh: 'Хабарламаларды жаңарту',
    loadMore: 'Бұрынғы хабарламаларды жүктеу',
    retry: 'Қайта көру',
    openOrder: 'Тапсырысты ашу',
    openMerchant: 'Мекеме кабинетінде тапсырысты ашу',
    orderNumber: '{number}-тапсырыс',
    quantity: 'Саны: {count}',
    pickupWindow: 'Алып кету',
    address: 'Алып кету мекенжайы',
    loginNeeded: 'Хабарламаларды көру үшін кір',
    loginHint: 'Бұл хабарламалар сенің аккаунтыңа тиесілі. Оқу үшін кір.',
    signIn: 'Кіру',
    preferences: 'Email хабарламалары',
    preferencesIntro:
      'Тапсырыс хабарламаларын email арқылы да алу-алмауды таңда. Олар бұл жерде кез келген жағдайда сақталады.',
    emailEnabled: 'Тапсырыс пен алып кету туралы хаттар жіберу',
    emailLocale: 'Хат тілі',
    localeHint:
      'Жаңа хаттар таңдалған тілде келеді. Интерфейс тілі өзгермейді.',
    emailRoleHint:
      'Тапсырыс хаттары сатып алушылар мен мекеме иелеріне қолжетімді. Қолданбадағы хабарламалар қолжетімді болып қалады.',
    verifiedNeeded:
      'Хаттарды қосу үшін email мекенжайыңды раста. Оларды кез келген уақытта өшіруге болады.',
    verifyEmail: 'Email растау',
    savePreferences: 'Хат баптауларын сақтау',
    preferencesSaved: 'Хат баптаулары сақталды.',
    preferencesUnknown:
      'Жауап жоғалды. Келесі өзгеріс алдында сақталған баптауларды жүкте.',
    reloadPreferences: 'Сақталған баптауларды жүктеу',
    preferencesDeliveryHint:
      'Өшіру болашақ жіберулерді тоқтатады. Email қызметі қабылдаған хаттарды қайтару мүмкін емес.',
    acceptedHint:
      'Email қызметінің хатты қабылдауы оның кіріс қалтаға жеткенін растамайды.',
    'email.pending': 'Хат жіберуді күтуде',
    'email.processing': 'Хат қызметке жіберілуде',
    'email.accepted': 'Email қызметі қабылдады',
    'email.failed': 'Хатты жіберу мүмкін болмады',
    'email.skipped': 'Хат жіберілмеді',
    'kind.order_confirmed': 'Тағамға тапсырыс расталды',
    'kind.order_cancelled': 'Тапсырысың жойылды',
    'kind.order_collected': 'Тапсырыс алынды',
    'kind.pickup_reminder': 'Алып кету туралы еске салғыш',
    'kind.booking_confirmed': 'Жаңа тапсырыс расталды',
    'kind.booking_cancelled': 'Тапсырыс жойылды',
    'kind.booking_collected': 'Тапсырыс берілді',
    'kind.order_not_collected': 'Алып кету уақыты аяқталды',
    'kind.booking_not_collected': 'Тапсырыс алынбады',
    'cancellation.cafe': 'Мекеме тоқтатты',
    'cancellation.buyer': 'Сатып алушы тоқтатты',
    'reason.unavailable': 'Тағам қолжетімді емес',
    'reason.closed': 'Мекеме алып кету үшін ашыла алмайды',
    'reason.quality_issue': 'Тағам мекеменің сапа талаптарына сай емес',
    'reason.other': 'Басқа себеп; толық ақпарат тапсырыста',
    'body.order_confirmed':
      'Мекеме тапсырысты алды. Тағамды көрсетілген уақытта алып, алған кезде төле.',
    'body.order_cancelled':
      'Бұл тапсырыс жабылды. Бұрынғы алып кету нұсқаулығы енді қолданылмайды.',
    'body.order_collected':
      'Мекеме тапсырыстың берілгенін растады. Жақсы тағамға екінші мүмкіндік бергеніңе рақмет.',
    'body.pickup_reminder':
      'Төмендегі алып кету уақытын тексеріп, ол аяқталғанша тағамды ал. Тапсырыс кодын оның парақшасынан табасың.',
    'body.booking_confirmed':
      'Тағамды алып кету уақытына дайындаңыз. Сатып алушының кодын тексергеннен кейін ғана беруді растаңыз.',
    'body.booking_cancelled':
      'Бұл тапсырыс жабылды. Кабинеттегі қолжетімділікті тексеріңіз.',
    'body.booking_collected': 'Осы тапсырыстың берілгені тіркелді.',
    'body.order_not_collected':
      'Алып кету уақыты аяқталғанша беру тіркелмеді. Код енді жарамсыз. Мәселе туындаса, тапсырыстан мекемеге жаз.',
    'body.booking_not_collected':
      'Алып кету уақыты беру тіркелмей аяқталды. Тапсырыс жабылды; оның тағамы автоматты түрде сатылымға қайтарылмайды.',
  },
}
