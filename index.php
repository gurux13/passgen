<?php 
require_once 'header.php';
require_once 'util.php';

if (isset($_REQUEST["logout"])) {
	unset($_SESSION['signature']);
	setcookie('signature', null, time()+60*60*24*30, null, null, null, true);
}
ensure_login();
?>
<body>
<div id="snackbar"></div>
<div id="cover" class="cover">&nbsp;</div>
<div class="res" style="display:none; overflow:hidden">
<h2>Результат</h2>
<table >
	<tr >
	<td>SHA1 мастер-пароля</td>
	<td id="master-sha" colspan="2"></td>
	</tr>
	<tr >
	<td>Результат:</td>
	<td class="resulting"><a class="repeatable" href="#" onclick="copyResultToClipboard(); return false;" id='result'></a></td>
	</tr>
	<tr >
	<td>Очистка:</td>
	<td><a href="#" class="repeatable" id="time-remaining" onclick="postponeCleanup(); return false"></a> <a href="#" class="repeatable" id="clean-now" onclick="cleanup(); return false;">Сейчас</a></td>
	</tr>	

</table>
</div>
<h2>Данные</h2>
<form method="post">
<table cellspacing="0" border="0">
	<tr>
		<td>Ресурс:</td>
		<td><input type="text" name="resource" id="resource-input" list="resources" autocomplete="false" class="gen-input"><br>
		<a href="#" class="res-control" id="res-control">Управление ресурсами</a>
		
		<div id="resources-list" class="res-list">
		
		
		<table id="resources-table">
		
		
				
		</table>
		
		</div>
		
		<datalist id="resources">

		</datalist>
		
		</td>
		<td><button onclick="resetresource();" type="button" class="reset">X</button></td>
		
		
	</tr>
	<tr>
		<td>Длина:</td>
		<td><input type="text" name="length" id="length-input" class="gen-input"></td>
		<td><button onclick="resetlength();" type="button" class="reset">X</button></td>
	</tr>
	<tr>
		<td>Ревизия:</td>
		<td><input type="text" name="revision" id="revision-input" class="gen-input"></td>
		<td><button onclick="resetrev();" type="button" class="reset">X</button></td>
	</tr>
	<tr>
		<td>Ограничения:</td>
		<td>
		<input type="checkbox" name="letters" id="letters-input" class="gen-input"><span class="cb">Буквы</span><br>
		<input type="checkbox" name="digits" id="digits-input" class="gen-input"><span class="cb">Цифры</span><br>
		<input type="checkbox" name="symbols" id="symbols-input" class="gen-input"><span class="cb">Спец. символы</span><br>
		<input type="checkbox" name="underscore" id="underscore-input" class="gen-input"><span class="cb">Подчёркивание</span><br>
		</td>
		<td><button onclick="resetlimits();" type="button" class="reset">X</button></td>
		</tr>
		
	<tr>
		<td>Мастер-пароль:</td>
		<td><input type="password" name="master" id="master-input" class="input-master gen-input" ></td>
		<td><button onclick="resetmaster();" type="button" class="reset">X</button></td>
	</tr>		
	<tr>
		<td colspan="3">
		<input type="button" name="generate" value="Генерировать" onclick="generate_click()">
		</td>
	</tr>
		<tr>
		<td colspan="3">
		<input type="button" value="Очистить" onclick="resetall();">
		</td>
	</tr>
	</table>
	
</form>
<a href='?logout'>Выйти</a>
<hr>
<center>
<h3>История изменений</h3>
<table class="passes">
<thead>
<tr>
	<td>Версия</td>
	<td>Дата</td>
	<td>Изменения</td>
</tr>
</thead>
<tbody>
<tr>
	
	<td>0.1</td>
	<td>Lost in time</td>
	<td>Первая версия</td>
</tr>
<tr>
	<td>0.2</td>
	<td>28.07.2012</td>
	<td><ul>
		<li>Сохранение ревизий</li>
		<li>Не показываются символы<br/>мастер-пароля, только<br/>первые байты SHA хеша</li>
		<li>Изменения дизайна</li>
		<li>Добавлены ограничения</li>
		</ul>
Обратная совместимость<br/>сохранена
		</td>
</tr>
<tr>
	<td>0.3</td>
	<td>05.06.2016</td>
	<td><ul>
		<li>Переезд на БД</li>
		<li>Вычисление пароля на клиенте</li>
		<li>Мобильное приложение</li>
		<li>Аккаунты</li>
		</ul>
		
				Обратная совместимость<br/><i>почти</i> сохранена (символ раньше чаще ставился на 1 место)<br>
		<a href="old.php">Обратно совместимая версия</a>
		</td>
		
</tr>
<tr>
	<td>0.3.1</td>
	<td>14.06.2016</td>
	<td><ul>
		<li>Управление ресурсами</li>
		</ul>
		Обратная совместимость<br/>сохранена
		</td>
		
</tr>
<tr>
	<td>0.3.2</td>
	<td>02.12.2016</td>
	<td><ul>
		<li>Исправлен баг с обработкой странных имён ресурсов</li>
		<li>Исправлен баг с кривой обработкой клика по тексту сгенерённого пароля</li>
		<li>Добавлена кнопка Выйти</li>
		</ul>
		Обратная совместимость<br/>сохранена
		</td>
		
</tr>
<tr>
	<td>0.3.3</td>
	<td>15.07.2019</td>
	<td><ul>
		<li>Поправлена авторизация</li>
		</ul>
		Обратная совместимость<br/>сохранена
		</td>
</tr>
<tr>
	<td>0.4.0</td>
	<td>25.10.2020</td>
	<td><ul>
		<li>Поправлена безопасность</li>
		<li>Переезд на ddns.net</li>
		<li>Переезд на github</li>
		<li>Включен HTTPS</li>
		</ul>
		Обратная совместимость<br/>сохранена
		</td>
</tr>
<tr>
	<td>0.4.1</td>
	<td>21.02.2021</td>
	<td><ul>
		<li>Поправлен вход</li>
		<li>Включена очистка</li>
		</ul>
		Обратная совместимость<br/>сохранена
	</td>
</tr>
</tbody>
</table>
<b>[Passwords generator]</b><br/>by gurux13 &copy; 2012-2021
</center>


</html>
