import type { Locale } from '@/shared/api'

export const lifecycleMessages: Record<Locale, Record<string, string>> = {
  en: {
    verifyTitle: 'Confirm your email',
    verifyHeading: 'One small step before you start',
    verifyIntro:
      'Confirm that this email belongs to you before reserving food, publishing offers or reviewing cafés.',
    verifyAddress: 'Your account email',
    verifySent:
      'A confirmation email was accepted for delivery. Check your inbox and spam folder, then open the link.',
    verifyNotSent:
      'Your account has been created, but the confirmation email could not be sent. Request it again below.',
    requestVerification: 'Send confirmation email',
    resendVerification: 'Send a new confirmation email',
    verifiedBadge: 'Email confirmed',
    unverifiedBadge: 'Email not confirmed',
    verifyNotice:
      'Confirm your email to make new reservations, publish offers and moderate cafés.',
    verifyLink: 'Confirm email',
    confirmAction: 'Confirm my email',
    confirmIntro:
      'Use the button below to confirm ownership of the email address that received this link.',
    confirmSuccess:
      'Email confirmed. Sign in again to continue with your account.',
    alreadyVerified: 'This account email is already confirmed.',
    forgotTitle: 'Recover your account',
    forgotHeading: 'Let’s get you back in',
    forgotIntro:
      'Enter the email you used to register. If it has an account, we will request a password reset email.',
    forgotAction: 'Request a reset link',
    forgotAccepted:
      'Request received. If this address has an account, check your inbox and spam folder for a reset link.',
    forgotResend: 'Request another link',
    resetTitle: 'Set a new password',
    resetHeading: 'A fresh start for your account',
    resetIntro:
      'Choose a new password. After it is saved, all existing sessions will close and you will sign in again.',
    resetAction: 'Save new password',
    resetSuccess:
      'Your password has been changed and your email confirmed. Sign in with your new password.',
    newPassword: 'New password',
    repeatPassword: 'Repeat new password',
    passwordHint: '15–128 characters. A long passphrase works well.',
    passwordMismatch: 'The passwords do not match.',
    passwordInvalid: 'Use a password of 15–128 characters.',
    show: 'Show password',
    hide: 'Hide password',
    email: 'Email',
    emailHint: 'you@example.com',
    pending: 'Please wait…',
    signIn: 'Sign in',
    profile: 'Open your profile',
    forgotLink: 'Forgot your password?',
    mailUnavailable:
      'Email delivery is temporarily unavailable. Please try again later.',
    rateLimited:
      'Please wait at least a minute before requesting another email. If the limit continues, try again later.',
    connection:
      'Connection lost. You can try again. If the link was already used, sign in or request a new link.',
    failure: 'We could not complete the request. Please try again.',
    invalidEmail: 'Enter a valid email address.',
    invalidLink:
      'This link has expired, was already used or is not valid. Request a new link.',
    missingLink:
      'Open the full link from your email. It contains the information needed to continue.',
    reopenLink:
      'For your privacy, the link is removed from the address bar after opening. If you reload this page, open the email link again.',
    verificationLogin:
      'Sign in to request a confirmation email for your account.',
    confirmationLogin:
      'Sign in to the account you created, then open the link from your email again.',
    accountMismatch:
      'This link belongs to a different account. Sign in to the account that received the email, then open the link again.',
    switchAccount: 'Sign out and switch account',
    backToLogin: 'Back to sign in',
    resetAnother: 'Request a new reset link',
  },
  ru: {
    verifyTitle: 'Подтверди email',
    verifyHeading: 'Один шаг перед началом',
    verifyIntro:
      'Подтверди, что email принадлежит тебе, чтобы бронировать еду, публиковать предложения и проверять заведения.',
    verifyAddress: 'Email твоего аккаунта',
    verifySent:
      'Письмо с подтверждением принято к отправке. Проверь входящие и спам, затем открой ссылку.',
    verifyNotSent:
      'Аккаунт создан, но письмо с подтверждением не удалось отправить. Запроси его ещё раз ниже.',
    requestVerification: 'Отправить письмо с подтверждением',
    resendVerification: 'Отправить новое письмо',
    verifiedBadge: 'Email подтверждён',
    unverifiedBadge: 'Email не подтверждён',
    verifyNotice:
      'Подтверди email, чтобы создавать новые брони, публиковать предложения и модерировать заведения.',
    verifyLink: 'Подтвердить email',
    confirmAction: 'Подтвердить мой email',
    confirmIntro:
      'Нажми кнопку ниже, чтобы подтвердить владение адресом, на который пришла эта ссылка.',
    confirmSuccess:
      'Email подтверждён. Войди заново, чтобы продолжить работу с аккаунтом.',
    alreadyVerified: 'Email этого аккаунта уже подтверждён.',
    forgotTitle: 'Восстановить доступ',
    forgotHeading: 'Вернём тебя в аккаунт',
    forgotIntro:
      'Введи email, указанный при регистрации. Если аккаунт существует, мы запросим письмо для сброса пароля.',
    forgotAction: 'Запросить ссылку для сброса',
    forgotAccepted:
      'Запрос принят. Если на этот адрес зарегистрирован аккаунт, проверь входящие и спам — нет ли ссылки для сброса.',
    forgotResend: 'Запросить ссылку ещё раз',
    resetTitle: 'Новый пароль',
    resetHeading: 'Начни с нового пароля',
    resetIntro:
      'Придумай новый пароль. После сохранения все открытые сессии завершатся и нужно будет войти заново.',
    resetAction: 'Сохранить новый пароль',
    resetSuccess: 'Пароль изменён, email подтверждён. Войди с новым паролем.',
    newPassword: 'Новый пароль',
    repeatPassword: 'Повтори новый пароль',
    passwordHint: '15–128 символов. Можно использовать длинную фразу.',
    passwordMismatch: 'Пароли не совпадают.',
    passwordInvalid: 'Нужен пароль из 15–128 символов.',
    show: 'Показать пароль',
    hide: 'Скрыть пароль',
    email: 'Email',
    emailHint: 'you@example.com',
    pending: 'Подожди…',
    signIn: 'Войти',
    profile: 'Открыть профиль',
    forgotLink: 'Забыла пароль?',
    mailUnavailable: 'Отправка писем временно недоступна. Попробуй позже.',
    rateLimited:
      'Подожди хотя бы минуту перед повторной отправкой. Если ограничение останется, попробуй позже.',
    connection:
      'Связь прервалась. Можно повторить попытку. Если ссылка уже использована, войди или запроси новую.',
    failure: 'Не удалось выполнить запрос. Попробуй ещё раз.',
    invalidEmail: 'Введи корректный email.',
    invalidLink:
      'Срок ссылки истёк, она уже использована или некорректна. Запроси новую.',
    missingLink:
      'Открой полную ссылку из письма. В ней есть данные, необходимые для продолжения.',
    reopenLink:
      'После открытия ссылка удаляется из адресной строки для защиты данных. Если обновишь страницу, открой ссылку из письма заново.',
    verificationLogin:
      'Войди, чтобы запросить подтверждение email своего аккаунта.',
    confirmationLogin:
      'Войди в созданный тобой аккаунт, затем снова открой ссылку из письма.',
    accountMismatch:
      'Эта ссылка относится к другому аккаунту. Войди в аккаунт, на email которого пришло письмо, затем открой ссылку снова.',
    switchAccount: 'Выйти и сменить аккаунт',
    backToLogin: 'Вернуться ко входу',
    resetAnother: 'Запросить новую ссылку для сброса',
  },
  kk: {
    verifyTitle: 'Email растау',
    verifyHeading: 'Бастамас бұрын бір қадам',
    verifyIntro:
      'Тағамға тапсырыс беру, ұсыныстарды жариялау және мекемелерді тексеру үшін email саған тиесілі екенін раста.',
    verifyAddress: 'Аккаунтыңның email мекенжайы',
    verifySent:
      'Растау хаты жіберуге қабылданды. Кіріс хаттар мен спам қалтасын тексеріп, сілтемені аш.',
    verifyNotSent:
      'Аккаунт ашылды, бірақ растау хатын жіберу мүмкін болмады. Төменде оны қайта сұрат.',
    requestVerification: 'Растау хатын жіберу',
    resendVerification: 'Жаңа растау хатын жіберу',
    verifiedBadge: 'Email расталған',
    unverifiedBadge: 'Email расталмаған',
    verifyNotice:
      'Жаңа тапсырыс беру, ұсыныстарды жариялау және мекемелерді тексеру үшін email мекенжайыңды раста.',
    verifyLink: 'Email растау',
    confirmAction: 'Email мекенжайымды растау',
    confirmIntro:
      'Осы сілтеме келген email мекенжайы саған тиесілі екенін растау үшін төмендегі батырманы бас.',
    confirmSuccess:
      'Email расталды. Аккаунтпен жұмысты жалғастыру үшін қайта кір.',
    alreadyVerified: 'Бұл аккаунттың email мекенжайы расталған.',
    forgotTitle: 'Қолжетімділікті қалпына келтіру',
    forgotHeading: 'Аккаунтыңа қайта оралайық',
    forgotIntro:
      'Тіркелген кездегі email мекенжайын енгіз. Аккаунт бар болса, құпиясөзді қалпына келтіру хатын сұратамыз.',
    forgotAction: 'Қалпына келтіру сілтемесін сұрату',
    forgotAccepted:
      'Сұрау қабылданды. Осы email мекенжайына аккаунт тіркелген болса, кіріс хаттар мен спам қалтасынан қалпына келтіру сілтемесін тексер.',
    forgotResend: 'Сілтемені қайта сұрату',
    resetTitle: 'Жаңа құпиясөз',
    resetHeading: 'Жаңа құпиясөзден баста',
    resetIntro:
      'Жаңа құпиясөз таңда. Ол сақталғаннан кейін барлық ашық сессиялар жабылады және қайта кіру қажет болады.',
    resetAction: 'Жаңа құпиясөзді сақтау',
    resetSuccess: 'Құпиясөз өзгертілді, email расталды. Жаңа құпиясөзбен кір.',
    newPassword: 'Жаңа құпиясөз',
    repeatPassword: 'Жаңа құпиясөзді қайтала',
    passwordHint: '15–128 таңба. Ұзын сөз тіркесін қолдануға болады.',
    passwordMismatch: 'Құпиясөздер сәйкес келмейді.',
    passwordInvalid: '15–128 таңбалы құпиясөз қажет.',
    show: 'Құпиясөзді көрсету',
    hide: 'Құпиясөзді жасыру',
    email: 'Email',
    emailHint: 'you@example.com',
    pending: 'Күте тұр…',
    signIn: 'Кіру',
    profile: 'Профильді ашу',
    forgotLink: 'Құпиясөзді ұмыттың ба?',
    mailUnavailable: 'Хат жіберу уақытша қолжетімсіз. Кейінірек қайта көр.',
    rateLimited:
      'Қайта жіберу алдында кемінде бір минут күте тұр. Шектеу сақталса, кейінірек қайта көр.',
    connection:
      'Байланыс үзілді. Қайта көр. Сілтеме қолданылған болса, кір немесе жаңа сілтемені сұрат.',
    failure: 'Сұрауды орындау мүмкін болмады. Қайта көр.',
    invalidEmail: 'Дұрыс email мекенжайын енгіз.',
    invalidLink:
      'Сілтеменің мерзімі өткен, ол қолданылған немесе жарамсыз. Жаңа сілтемені сұрат.',
    missingLink:
      'Хаттағы толық сілтемені аш. Онда жалғастыруға қажет деректер бар.',
    reopenLink:
      'Деректерді қорғау үшін ашылған сілтеме мекенжай жолынан өшіріледі. Бетті жаңартсаң, хаттағы сілтемені қайта аш.',
    verificationLogin: 'Аккаунтыңның email мекенжайын растау үшін кір.',
    confirmationLogin:
      'Өзің ашқан аккаунтқа кір, содан кейін хаттағы сілтемені қайта аш.',
    accountMismatch:
      'Бұл сілтеме басқа аккаунтқа тиесілі. Хат келген email мекенжайымен тіркелген аккаунтқа кіріп, сілтемені қайта аш.',
    switchAccount: 'Шығып, басқа аккаунтқа кіру',
    backToLogin: 'Кіруге оралу',
    resetAnother: 'Жаңа қалпына келтіру сілтемесін сұрату',
  },
}
