<?php
require_once 'header.php';
$nologin = false;
if (isset($_REQUEST['login'])){
	$user = $_REQUEST['login'];
	$password = $_REQUEST['password'];
	if (!$user || !$password) {
		$nologin = true;
	}
	else {
		$passhash = hash("sha512", $password, false);
		$user_safe = mysqli_real_escape_string($link, $user);
		if ($user_safe !== $user) {
			die("Please use a plain user name");
		}
		$passhash_safe = mysqli_real_escape_string($link, $passhash);
		$res = mysqli_query($link, "select * from logins where login='$user_safe'");
		
		if (mysqli_num_rows($res) == 0) {
			$signature = 's'.$user_safe . $passhash_safe;
			mysqli_query($link, "insert into logins set login='$user_safe', passhash='$passhash_safe', signature='$signature'");
			$_SESSION['signature'] = $signature;
			$_SESSION['login'] = $user_safe;
			header("Location: index.php");
			
			echo "Успешно!<br>";
			die("<a href='index.php'> Click me!</a>");
		} 
		else
		{
			
			$row = mysqli_fetch_assoc($res);
			if ($row['passhash'] != $passhash) {
				$nologin = true;
			} else {
				mysqli_query($link, "update logins set lastlogin=current_timestamp() where login='$user_safe'") or die (mysql_error());
				$_SESSION['signature'] = $row['signature'];
				$_SESSION['login'] = $row['login'];
				header("Location: index.php");
				
				echo "Успешно!<br>";
				die("<a href='index.php'> Click me!</a>");
			}
	
		}
	}
}
?>
<?php if ($nologin){?>
<div style="color:red">Неверный пароль</div>
<?php }?>
<form method="post">

<table>
<tr>
<td>Логин: 
</td><td><input type="text" name="login"> </td>
</tr>
<tr>
<td>Пароль:</td><td><input type="password" name="password"></td>
</tr>
<tr>
<td colspan="2"><input type="submit" value="Войти"> </td> 
</tr>


</table>

</form>
