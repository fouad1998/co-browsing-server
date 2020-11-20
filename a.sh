while [ true ]
do
cat ./src/cobrowsing/serialization.ts > ../cobrowsingclient/src/cobrowsing/serialization.ts
echo 'copying done!'
date
sleep 10
done
