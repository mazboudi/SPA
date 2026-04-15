Add-Printer -ConnectionName "\\10.253.57.135\corp secureprint pune"
Start-Sleep -Seconds 10
$AvailablePrinters=Get-WmiObject -ClassName Win32_Printer
($AvailablePrinters | Where-Object -FilterScript {$_.Name -eq "\\10.253.57.135\corp secureprint pune"}).SetDefaultPrinter()