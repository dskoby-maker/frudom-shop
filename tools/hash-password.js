/* Отпечаток пароля для кабинета менеджера. Запуск: node tools/hash-password.js
   Спросит пароль и напечатает строку вида scrypt$...$... — её вписать в ADMIN_USERS на сервере:
   ADMIN_USERS="Даниил:admin:scrypt$...;Наталья:manager:scrypt$..."   (сам пароль никуда не записывается) */
const readline = require('readline'), { hashPassword } = require('../lib/auth.js');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Пароль (не меньше 10 символов): ', pw => {
  rl.close();
  if (String(pw).length < 10) { console.error('Слишком короткий пароль.'); process.exit(1); }
  console.log(hashPassword(pw));
});
