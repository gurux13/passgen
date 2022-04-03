<?php
$link = mysqli_connect("localhost", getenv('MYSQL_USER'), getenv('MYSQL_PASSWORD')) or die (mysqli_connect_error());
mysqli_select_db($link, "passgen") or die(mysqli_error($link));
?>
