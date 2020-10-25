<?php
$link = mysqli_connect("localhost", "passgen", $_ENV['MYSQL_PASSWORD']) or die (mysql_error());
mysqli_select_db($link, "passgen") or die(mysql_error());
?>
