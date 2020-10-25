<?php
$link = mysqli_connect("localhost", "passgen", getenv('MYSQL_PASSWORD')) or die (mysql_error());
mysqli_select_db($link, "passgen") or die(mysql_error());
?>
